import { app, BrowserWindow, ipcMain, shell, screen, globalShortcut, webContents } from 'electron';
import path from 'path';
import url from 'url';
import { google } from 'googleapis';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import { MongoClient, ObjectId } from 'mongodb';
import { spawn, spawnSync } from 'child_process';
import { connectMongoose } from './models/mongoose';
import ChatgptConfig from './models/ChatgptConfig';

// Improve transparency support on Linux compositors
app.commandLine.appendSwitch('enable-transparent-visuals');
// Workaround sandbox issue in local dev environments
app.commandLine.appendSwitch('no-sandbox');

let mainWindow: BrowserWindow | null = null;

// Paths and config helpers
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'overlay.config.json');
const DEFAULT_CFG = { displayIndex: null as number | null, fullscreen: true, contentProtection: false };
function loadConfig(): typeof DEFAULT_CFG {
	try {
		const raw = fs.readFileSync(CONFIG_PATH(), 'utf-8');
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_CFG, ...parsed };
	} catch {
		return { ...DEFAULT_CFG };
	}
}
function saveConfig(cfg: typeof DEFAULT_CFG) {
	try {
		fs.mkdirSync(app.getPath('userData'), { recursive: true });
		fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2), 'utf-8');
	} catch {}
}

// Local secret management for encrypting sensitive fields (e.g., API keys)
function getSecretKeyPath() {
	return path.join(app.getPath('userData'), 'secret.key');
}
function getOrCreateSecretKey(): Buffer {
	const p = getSecretKeyPath();
	try {
		if (fs.existsSync(p)) {
			const raw = fs.readFileSync(p);
			if (raw && raw.length === 32) return raw; // 32 bytes for AES-256
		}
		const buf = crypto.randomBytes(32);
		fs.writeFileSync(p, buf);
		return buf;
	} catch {
		// Fallback ephemeral key (won't persist across runs)
		return crypto.randomBytes(32);
	}
}
function encryptStringAesGcm(plainText: string) {
	const key = getOrCreateSecretKey();
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return { algo: 'aes-256-gcm', iv: iv.toString('base64'), ct: enc.toString('base64'), tag: tag.toString('base64') };
}
function decryptStringAesGcm(encObj: any) {
	try {
		if (!encObj || encObj.algo !== 'aes-256-gcm') return '';
		const key = getOrCreateSecretKey();
		const iv = Buffer.from(String(encObj.iv || ''), 'base64');
		const ct = Buffer.from(String(encObj.ct || ''), 'base64');
		const tag = Buffer.from(String(encObj.tag || ''), 'base64');
		const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
		decipher.setAuthTag(tag);
		const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
		return dec.toString('utf8');
	} catch {
		return '';
	}
}

function enforceAlwaysOnTop(win: BrowserWindow | null) {
	if (!win) return;
	// 'screen-saver' tends to stay above most windows, including fullscreen
	(win as any).setAlwaysOnTop(true, 'screen-saver');
	// Keep on all workspaces and over fullscreen spaces when possible
	try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true } as any); } catch {}
}

// MongoDB (Prompt Store)
let mongoClient: MongoClient | null = null;
let mongoDb: any = null;
async function getMongo() {
	if (mongoDb) return mongoDb;
	const uri = 'mongodb://127.0.0.1:27017';
	mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 } as any);
	await mongoClient.connect();
	mongoDb = mongoClient.db('watcher');
	return mongoDb;
}

// --- Audio Monitor (PulseAudio + OpenAI Whisper) ---
let audioMon = {
	proc: null as any,
	segmentsDir: '',
	openaiKey: '',
	segmentSeconds: 15,
	running: false,
	transcript: '',
	summary: ''
};

function getSegmentsDir() {
	const dir = path.join(app.getPath('userData'), 'audio_segments');
	try { fs.mkdirSync(dir, { recursive: true }); } catch {}
	return dir;
}

function detectFfmpeg() {
	try {
		const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' });
		return r.status === 0;
	} catch { return false; }
}

function detectPulseMonitor() {
	try {
		const r = spawnSync('pactl', ['info'], { encoding: 'utf-8' });
		if (r.status === 0 && r.stdout) {
			const m = r.stdout.split('\n').find(l => l.toLowerCase().startsWith('default sink:'));
			if (m) {
				const sink = m.split(':').slice(1).join(':').trim();
				if (sink) return `${sink}.monitor`;
			}
		}
	} catch {}
	return 'default';
}

async function transcribeFile(filePath: string) {
	try {
		const stat = fs.statSync(filePath);
		if (!stat || stat.size < 1024) return null;
		const form = new FormData();
		form.append('model', 'whisper-1');
		form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
		const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: { Authorization: `Bearer ${audioMon.openaiKey}` },
			body: form as any
		});
		if (!res.ok) return null;
		const data = await res.json();
		return (data as any).text || '';
	} catch {
		return null;
	}
}

async function updateSummary() {
	try {
		if (!audioMon.transcript.trim()) return;
		const res = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${audioMon.openaiKey}` },
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: 'Você é um assistente que resume áudio transcrito de forma breve e objetiva em português.' },
					{ role: 'user', content: `Transcrição acumulada (faça um resumo curto, objetivo e atualizado):\n\n${audioMon.transcript.slice(-8000)}` }
				]
			})
		});
		if (!res.ok) return;
		const data = await res.json();
		audioMon.summary = (data as any).choices?.[0]?.message?.content || audioMon.summary;
		try { mainWindow?.webContents.send('audio:summary-update', { summary: audioMon.summary }); } catch {}
	} catch {}
}

function watchSegments(dir: string) {
	try {
		const watcher = fs.watch(dir, async (event, filename) => {
			if (event !== 'rename' || !filename) return;
			const filePath = path.join(dir, filename);
			setTimeout(async () => {
				if (!fs.existsSync(filePath)) return;
				const text = await transcribeFile(filePath);
				if (text && text.trim()) {
					audioMon.transcript += (audioMon.transcript ? '\n' : '') + text.trim();
					try { mainWindow?.webContents.send('audio:transcript-chunk', { text }); } catch {}
					updateSummary();
				}
				try { fs.unlinkSync(filePath); } catch {}
			}, 300);
		});
		return watcher;
	} catch {
		return null;
	}
}

let segmentsWatcher: fs.FSWatcher | null = null;

function startAudioMonitor({ openaiKey, segmentSeconds = 15 }: { openaiKey: string, segmentSeconds?: number } = { openaiKey: '' }) {
	if (audioMon.running) return { ok: true };
	if (!detectFfmpeg()) {
		try { mainWindow?.webContents.send('audio:error', { message: 'ffmpeg não encontrado no PATH.' }); } catch {}
		return { ok: false, error: 'ffmpeg não encontrado.' };
	}
	audioMon.openaiKey = String(openaiKey || '').trim();
	if (!audioMon.openaiKey) return { ok: false, error: 'OpenAI API key é obrigatório.' };
	audioMon.segmentSeconds = Math.max(5, Number(segmentSeconds) || 15);
	audioMon.transcript = '';
	audioMon.summary = '';
	const dir = getSegmentsDir();
	audioMon.segmentsDir = dir;
	const inputName = detectPulseMonitor();
	const pattern = path.join(dir, 'seg-%03d.wav');
	const args = [
		'-y',
		'-f', 'pulse',
		'-i', inputName,
		'-ac', '1',
		'-ar', '16000',
		'-f', 'segment',
		'-segment_time', String(audioMon.segmentSeconds),
		'-reset_timestamps', '1',
		pattern
	];
	try {
		audioMon.proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
		audioMon.proc.stderr?.on('data', (d: Buffer) => {
			const msg = String(d || '').trim();
			if (msg) try { mainWindow?.webContents.send('audio:log', { msg }); } catch {}
		});
		audioMon.proc.on('error', (e: any) => {
			try { mainWindow?.webContents.send('audio:error', { message: e?.message || 'erro no ffmpeg' }); } catch {}
		});
		audioMon.proc.on('exit', (code: number) => {
			audioMon.running = false;
			try { mainWindow?.webContents.send('audio:log', { msg: `ffmpeg saiu com código ${code}` }); } catch {}
		});
		audioMon.running = true;
		segmentsWatcher = watchSegments(dir) as any;
		return { ok: true, input: inputName };
	} catch (e: any) {
		audioMon.running = false;
		return { ok: false, error: e?.message };
	}
}

function stopAudioMonitor() {
	try { (segmentsWatcher as any)?.close(); } catch {}
	segmentsWatcher = null;
	if (audioMon.proc && !(audioMon.proc as any).killed) {
		try { (audioMon.proc as any).kill('SIGTERM'); } catch {}
	}
	audioMon.proc = null;
	audioMon.running = false;
	return { ok: true };
}

ipcMain.handle('audio:start-monitor', (_evt, { openaiKey, segmentSeconds }) => startAudioMonitor({ openaiKey, segmentSeconds }));
ipcMain.handle('audio:stop-monitor', () => stopAudioMonitor());
ipcMain.handle('audio:get-status', () => ({ running: audioMon.running, transcript: audioMon.transcript, summary: audioMon.summary }));

// Google OAuth state
let googleOAuthClient: any = null;
let googleTokens: any = null;
let pendingPkce: { codeVerifier: string; redirectUri: string; clientId: string; clientSecret?: string | null } | null = null; // { codeVerifier, redirectUri, clientId, clientSecret }

function positionWindowOnTargetDisplay(win: BrowserWindow) {
	const cfg = loadConfig();
	const displays = screen.getAllDisplays();
	const primary = screen.getPrimaryDisplay();
	let target = primary;
	if (typeof cfg.displayIndex === 'number' && displays[cfg.displayIndex]) {
		target = displays[cfg.displayIndex];
	}
	const b = target.bounds;
	win.setFullScreen(false);
	win.setBounds({ x: (b as any).x, y: (b as any).y, width: (b as any).width, height: (b as any).height }, false);
	if (cfg.fullscreen !== false) {
		win.setFullScreen(true);
	}
	enforceAlwaysOnTop(win);
}

function createMainWindow() {
	const cfg = loadConfig();
	const displays = screen.getAllDisplays();
	const primary = screen.getPrimaryDisplay();
	let target = primary;
	if (typeof cfg.displayIndex === 'number' && displays[cfg.displayIndex]) {
		target = displays[cfg.displayIndex];
	}
	const b = target.bounds as any;

	mainWindow = new BrowserWindow({
		x: b.x,
		y: b.y,
		width: b.width,
		height: b.height,
		transparent: true,
		backgroundColor: '#00000000',
		frame: false,
		fullscreen: false,
		alwaysOnTop: true,
		resizable: false,
		hasShadow: false,
		show: false,
		focusable: true,
		skipTaskbar: true,
		webPreferences: {
			preload: path.join(app.getAppPath(), 'dist', 'preload.js'),
			nodeIntegration: false,
			contextIsolation: true,
			webviewTag: true,
			devTools: true,
		}
	});

	mainWindow.setMenuBarVisibility(false);
	// Capture events and rely on setShape for click-through
	mainWindow.setIgnoreMouseEvents(false);
	// Apply content protection based on config
	try { (mainWindow as any).setContentProtection(Boolean(cfg.contentProtection)); } catch {}
	enforceAlwaysOnTop(mainWindow);

	const indexUrl = url.pathToFileURL(path.join(app.getAppPath(), 'public/index.html')).toString();
	mainWindow.loadURL(indexUrl);

	mainWindow.once('ready-to-show', () => {
		// Apply fullscreen and always-on-top after initial layout for the target monitor
		positionWindowOnTargetDisplay(mainWindow!);
		mainWindow?.showInactive();
	});

	// Re-apply always-on-top on common state changes
	mainWindow.on('show', () => enforceAlwaysOnTop(mainWindow));
	mainWindow.on('focus', () => enforceAlwaysOnTop(mainWindow));
	mainWindow.on('blur', () => enforceAlwaysOnTop(mainWindow));
	mainWindow.on('enter-full-screen', () => enforceAlwaysOnTop(mainWindow));
	mainWindow.on('leave-full-screen', () => enforceAlwaysOnTop(mainWindow));

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

app.on('ready', () => {
	createMainWindow();
	try {
		let smartMode = true; // true: click-through por shape; false: captura total
		globalShortcut.register('Control+B', () => {
			if (!mainWindow) return;
			smartMode = !smartMode;
			if (smartMode) {
				// Volta para modo shape inteligente: renderer recalcula shape
				mainWindow.setIgnoreMouseEvents(false);
				(mainWindow as any).setShape([]); // limpa shape atual
				mainWindow.webContents.send('overlay:mode-smart');
			} else {
				// Modo clique real em toda a janela
				mainWindow.setIgnoreMouseEvents(false);
				const [w, h] = mainWindow.getSize();
				(mainWindow as any).setShape([{ x: 0, y: 0, width: w, height: h }]);
			}
		});
		
		// DevTools shortcut
		globalShortcut.register('F12', () => {
			if (!mainWindow) return;
			if (mainWindow.webContents.isDevToolsOpened()) {
				mainWindow.webContents.closeDevTools();
			} else {
				mainWindow.webContents.openDevTools({ mode: 'detach' });
			}
		});
		
		// Debug shortcut to show taskbar
		globalShortcut.register('Control+Shift+T', () => {
			if (!mainWindow) return;
			mainWindow.webContents.executeJavaScript('showTaskbar && showTaskbar()');
		});
	} catch {}
});

app.on('window-all-closed', () => {
	app.quit();
});

// IPC: overlay controls
ipcMain.handle('overlay:set-ignore-mouse-events', (_evt, shouldIgnore: boolean, opts?: any) => {
	if (!mainWindow) return;
	const ignore = Boolean(shouldIgnore);
	const options = ignore ? { forward: true, ...(opts || {}) } : undefined;
	(mainWindow as any).setIgnoreMouseEvents(ignore, options);
});

ipcMain.handle('overlay:set-always-on-top', () => {
	// Enforce always-on-top regardless of requested value
	if (!mainWindow) return;
	enforceAlwaysOnTop(mainWindow);
});

ipcMain.handle('overlay:toggle-fullscreen', () => {
	if (!mainWindow) return;
	const cfg = loadConfig();
	const newVal = !mainWindow.isFullScreen();
	mainWindow.setFullScreen(newVal);
	enforceAlwaysOnTop(mainWindow);
	saveConfig({ ...cfg, fullscreen: newVal });
});

ipcMain.handle('overlay:set-content-protection', (_evt, enabled: boolean) => {
	if (!mainWindow) return;
	const cfg = loadConfig();
	try { (mainWindow as any).setContentProtection(Boolean(enabled)); } catch {}
	saveConfig({ ...cfg, contentProtection: Boolean(enabled) });
	return { ok: true };
});

// IPC: displays and config
ipcMain.handle('overlay:get-displays', () => {
	const displays = screen.getAllDisplays();
	const primaryId = screen.getPrimaryDisplay().id;
	return displays.map((d, index) => ({
		id: d.id,
		index,
		bounds: d.bounds as any,
		isPrimary: d.id === primaryId,
		label: `${index + 1} - ${(d as any).bounds.width}x${(d as any).bounds.height} @ ${(d as any).bounds.x},${(d as any).bounds.y}${d.id === primaryId ? ' (primário)' : ''}`
	}));
});

ipcMain.handle('overlay:get-config', () => loadConfig());

ipcMain.handle('overlay:apply-display', (_evt, displayIndex: number) => {
	const displays = screen.getAllDisplays();
	if (typeof displayIndex !== 'number' || !displays[displayIndex]) return { ok: false };
	const cfg = loadConfig();
	saveConfig({ ...cfg, displayIndex });
	if (mainWindow) {
		positionWindowOnTargetDisplay(mainWindow);
	}
	return { ok: true };
});

ipcMain.handle('overlay:get-local-cursor', () => {
	if (!mainWindow) return { x: 0, y: 0 };
	try {
		const { x, y } = screen.getCursorScreenPoint();
		const [wx, wy] = mainWindow.getPosition();
		return { x: x - wx, y: y - wy };
	} catch {
		return { x: 0, y: 0 };
	}
});

ipcMain.handle('overlay:set-shape', (_evt, rects: Array<{ x: number; y: number; width: number; height: number }>) => {
	if (!mainWindow) return;
	try {
		// rects: [{x,y,width,height}] in DIP coordinates
		(mainWindow as any).setShape(Array.isArray(rects) ? rects : []);
	} catch {}
});

ipcMain.handle('overlay:quit', () => {
	try { globalShortcut.unregisterAll(); } catch {}
	try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy(); } catch {}
	try { app.quit(); } catch {}
	setTimeout(() => { try { app.exit(0); } catch {} }, 50);
});

// Resolve asset file URL for renderer/webview
ipcMain.handle('assets:get-file-url', (_evt, relPath: string) => {
	try {
		const p = path.join(app.getAppPath(), String(relPath || ''));
		return url.pathToFileURL(p).toString();
	} catch (e) {
		return '';
	}
});

ipcMain.handle('assets:get-file-path', (_evt, relPath: string) => {
	try {
		const p = path.join(app.getAppPath(), String(relPath || ''));
		return p;
	} catch (e) {
		return '';
	}
});

ipcMain.handle('overlay:toggle-webview-devtools', (_evt, { webContentsId, dock = 'right' }: { webContentsId: number; dock?: 'right' | 'bottom' | 'undocked' | 'detach' }) => {
	try {
		const idNum = Number(webContentsId);
		if (!idNum) return { ok: false };
		const target = webContents.fromId(idNum);
		if (!target) return { ok: false };
		let open = false;
		if (target.isDevToolsOpened()) {
			target.closeDevTools();
			open = false;
		} else {
			target.openDevTools({ mode: dock as any });
			open = true;
		}
		try { mainWindow?.webContents.send('overlay:webview-devtools-state', { open }); } catch {}
		return { ok: true };
	} catch (e: any) {
		return { ok: false, error: e?.message };
	}
});

// Prompt Store IPC
ipcMain.handle('promptStore:save', async (_evt, { prompt, effect, validated, comments }) => {
	try {
		const db = await getMongo();
		const doc = {
			prompt: String(prompt || ''),
			effect: String(effect || ''),
			validated: Boolean(validated),
			comments: String(comments || ''),
			createdAt: new Date()
		};
		const res = await db.collection('prompts').insertOne(doc);
		return { ok: true, id: String(res.insertedId) };
	} catch (e: any) {
		return { ok: false, error: e?.message };
	}
});

ipcMain.handle('promptStore:list', async (_evt, { q } = {} as any) => {
	try {
		const db = await getMongo();
		let filter: any = {};
		if (q && String(q).trim()) {
			const regex = new RegExp(String(q).trim(), 'i');
			filter = { $or: [ { prompt: regex }, { effect: regex }, { comments: regex } ] };
		}
		const items = await db.collection('prompts').find(filter).sort({ createdAt: -1 }).limit(200).toArray();
		return items.map((x: any) => ({ id: String(x._id), prompt: x.prompt, effect: x.effect, validated: !!x.validated, comments: x.comments || '', createdAt: x.createdAt }));
	} catch (e: any) {
		return { ok: false, error: e?.message, items: [] };
	}
});

ipcMain.handle('promptStore:update', async (_evt, { id, validated, comments }) => {
	try {
		if (!id) return { ok: false, error: 'id required' };
		const db = await getMongo();
		const _id = new ObjectId(String(id));
		await db.collection('prompts').updateOne({ _id }, { $set: { validated: validated != null ? Boolean(validated) : undefined, comments: comments != null ? String(comments) : undefined } });
		return { ok: true };
	} catch (e: any) {
		return { ok: false, error: e?.message };
	}
});

// Links Repo IPC
ipcMain.handle('linkRepo:save', async (_evt, { title, url: linkUrl, tags, notes, favorite }) => {
	try {
		const db = await getMongo();
		const doc = {
			title: String(title || ''),
			url: String(linkUrl || ''),
			tags: Array.isArray(tags) ? (tags as any).map(String) : String(tags || '').split(',').map(s => s.trim()).filter(Boolean),
			notes: String(notes || ''),
			favorite: Boolean(favorite),
			createdAt: new Date()
		};
		const res = await db.collection('links').insertOne(doc);
		return { ok: true, id: String(res.insertedId) };
	} catch (e: any) {
		return { ok: false, error: e?.message };
	}
});

ipcMain.handle('linkRepo:list', async (_evt, { q } = {} as any) => {
	try {
		const db = await getMongo();
		let filter: any = {};
		if (q && String(q).trim()) {
			const regex = new RegExp(String(q).trim(), 'i');
			filter = { $or: [ { title: regex }, { url: regex }, { tags: regex }, { notes: regex } ] };
		}
		const items = await db.collection('links').find(filter).sort({ favorite: -1, createdAt: -1 }).limit(200).toArray();
		return items.map((x: any) => ({ id: String(x._id), title: x.title, url: x.url, tags: x.tags || [], notes: x.notes || '', favorite: !!x.favorite, createdAt: x.createdAt }));
	} catch (e: any) {
		return { ok: false, error: e?.message, items: [] };
	}
});

ipcMain.handle('linkRepo:update', async (_evt, { id, title, url: linkUrl, tags, notes, favorite }) => {
	try {
		if (!id) return { ok: false, error: 'id required' };
		const db = await getMongo();
		const _id = new ObjectId(String(id));
		const $set: any = {};
		if (title != null) $set.title = String(title);
		if (linkUrl != null) $set.url = String(linkUrl);
		if (tags != null) $set.tags = Array.isArray(tags) ? (tags as any).map(String) : String(tags).split(',').map((s: string) => s.trim()).filter(Boolean);
		if (notes != null) $set.notes = String(notes);
		if (favorite != null) $set.favorite = Boolean(favorite);
		await db.collection('links').updateOne({ _id }, { $set });
		return { ok: true };
	} catch (e: any) {
		return { ok: false, error: e?.message };
	}
});

// ChatGPT Config IPC (with encryption)
ipcMain.handle('chatgpt:get-config', async () => {
	try {
		await connectMongoose();
		const cfg = await (ChatgptConfig as any).findById('chatgpt').lean();
		let apiKey = '';
		if (cfg?.apiKeyEnc) {
			apiKey = decryptStringAesGcm(cfg.apiKeyEnc) || '';
		} else if (cfg?.apiKey) {
			// Backward-compat: legacy plaintext (will remain until user saves again)
			apiKey = String(cfg.apiKey || '');
		}
		console.log('[chatgpt:get-config] found=', !!cfg, 'model=', cfg?.model);
		return { apiKey, model: cfg?.model || 'gpt-4o-mini' };
	} catch (e: any) {
		console.error('[chatgpt:get-config] error:', e?.message || e);
		return { apiKey: '', model: 'gpt-4o-mini', error: e?.message };
	}
});

ipcMain.handle('chatgpt:save-config', async (_evt, { apiKey, model }) => {
	try {
		await connectMongoose();
		const trimmed = String(apiKey || '').trim();
		const set: any = { model: String(model || 'gpt-4o-mini'), updatedAt: new Date() };
		if (trimmed) set.apiKeyEnc = encryptStringAesGcm(trimmed);
		const res = await (ChatgptConfig as any).updateOne({ _id: 'chatgpt' }, { $set: set, $unset: { apiKey: '' } }, { upsert: true });
		try {
			// marker file to confirm handler ran
			const marker = path.join(app.getPath('userData'), 'last-chatgpt-save.json');
			fs.writeFileSync(marker, JSON.stringify({ when: new Date().toISOString(), model: String(model || 'gpt-4o-mini'), setKey: !!trimmed, mongo: res }, null, 2));
		} catch {}
		console.log('[chatgpt:save-config] ok res=', res);
		return { ok: true };
	} catch (e: any) {
		console.error('[chatgpt:save-config] error:', e?.message || e);
		return { ok: false, error: e?.message };
	}
});

// --- Helpers for Google OAuth PKCE ---
function toBase64Url(buffer: Buffer) {
	return buffer.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}
function createPkcePair() {
	const codeVerifier = toBase64Url(crypto.randomBytes(32));
	const challenge = toBase64Url(crypto.createHash('sha256').update(codeVerifier).digest());
	return { codeVerifier, codeChallenge: challenge };
}

function createOAuthClient({ clientId, clientSecret, redirectUri }: { clientId: string; clientSecret?: string; redirectUri: string }) {
	if (!clientId) throw new Error('Google Client ID é obrigatório.');
	return new (google as any).auth.OAuth2({ clientId, clientSecret: clientSecret || undefined, redirectUri });
}

// Manual (copy/paste) flow — keeps PKCE in memory between begin and finish
ipcMain.handle('gcal:begin-auth', async (_evt, { clientId, clientSecret }) => {
	const { codeVerifier, codeChallenge } = createPkcePair();
	const redirectUri = 'http://127.0.0.1:53682/callback';
	const oauth2 = createOAuthClient({ clientId, clientSecret, redirectUri });
	const scopes = [
		'https://www.googleapis.com/auth/calendar.readonly',
		'openid', 'email', 'profile'
	];
	const authUrl = (oauth2 as any).generateAuthUrl({
		access_type: 'offline',
		scope: scopes,
		code_challenge_method: 'S256',
		code_challenge: codeChallenge
	});
	pendingPkce = { codeVerifier, redirectUri, clientId, clientSecret };
	return { authUrl };
});

ipcMain.handle('gcal:finish-auth', async (_evt, { clientId, clientSecret, authCode }) => {
	if (!pendingPkce || pendingPkce.clientId !== clientId) throw new Error('Fluxo de login não iniciado ou expirado.');
	const oauth2 = createOAuthClient({ clientId, clientSecret, redirectUri: pendingPkce.redirectUri });
	const { tokens } = await (oauth2 as any).getToken({ code: authCode, codeVerifier: pendingPkce.codeVerifier });
	(oauth2 as any).setCredentials(tokens);
	googleTokens = tokens;
	googleOAuthClient = oauth2;
	pendingPkce = null;
	return { ok: true };
});

// Automatic loopback server flow
ipcMain.handle('gcal:auth-auto', async (_evt, { clientId, clientSecret }) => {
	const server = http.createServer();
	const listenPort = await new Promise<number>((resolve, reject) => {
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (addr && typeof addr === 'object') resolve((addr as any).port);
			else reject(new Error('Falha ao abrir porta local.'));
		});
	});
	const redirectUri = `http://127.0.0.1:${listenPort}/callback`;
	const { codeVerifier, codeChallenge } = createPkcePair();
	const oauth2 = createOAuthClient({ clientId, clientSecret, redirectUri });
	const scopes = [
		'https://www.googleapis.com/auth/calendar.readonly',
		'openid', 'email', 'profile'
	];
	const authUrl = (oauth2 as any).generateAuthUrl({
		access_type: 'offline',
		scope: scopes,
		code_challenge_method: 'S256',
		code_challenge: codeChallenge
	});

	// Wait for callback
	const code = await new Promise<string>((resolve, reject) => {
		const timeout = setTimeout(() => {
			server.close();
			reject(new Error('Tempo esgotado aguardando autorização.'));
		}, 120000);
		server.on('request', (req, res) => {
			try {
				const parsed = new URL(req.url || '/', `http://127.0.0.1:${listenPort}`);
				if (parsed.pathname === '/callback') {
					const authCode = parsed.searchParams.get('code');
					res.statusCode = 200;
					res.setHeader('Content-Type', 'text/html; charset=utf-8');
					res.end('<html><body><h3>Login concluído. Você pode fechar esta janela.</h3></body></html>');
					clearTimeout(timeout);
					server.close();
					if (authCode) resolve(authCode); else reject(new Error('Código não recebido.'));
					return;
				}
				res.statusCode = 404; res.end();
			} catch (e) {
				res.statusCode = 500; res.end('Erro.');
			}
		});
	});

	const { tokens } = await (oauth2 as any).getToken({ code, codeVerifier });
	(oauth2 as any).setCredentials(tokens);
	googleTokens = tokens;
	googleOAuthClient = oauth2;

	// Open user's browser after starting server
	shell.openExternal(authUrl);

	return { ok: true };
});

ipcMain.handle('gcal:list-events', async (_evt, { clientId, clientSecret, calendarId = 'primary' }) => {
	if (!googleOAuthClient) {
		if (!googleTokens) throw new Error('Não autenticado.');
		// Recreate client if needed
		googleOAuthClient = createOAuthClient({ clientId, clientSecret, redirectUri: 'http://127.0.0.1' });
		(googleOAuthClient as any).setCredentials(googleTokens);
	}
	const calendar = (google as any).calendar({ version: 'v3', auth: googleOAuthClient });
	const now = new Date();
	const res = await calendar.events.list({
		calendarId,
		timeMin: now.toISOString(),
		maxResults: 10,
		singleEvents: true,
		orderBy: 'startTime'
	});
	return res.data.items || [];
}); 