import { app, BrowserWindow, ipcMain, shell, screen, globalShortcut, webContents } from 'electron';
import path from 'path';
import fs from 'fs';
// Use Cases
import ConfigUseCase from './src/usecases/ConfigUseCase.js';
import CryptoUseCase from './src/usecases/CryptoUseCase.js';
import DatabaseUseCase from './src/usecases/DatabaseUseCase.js';
import AudioMonitorUseCase from './src/usecases/AudioMonitorUseCase.js';
import WindowManagementUseCase from './src/usecases/WindowManagementUseCase.js';
import GoogleOAuthUseCase from './src/usecases/GoogleOAuthUseCase.js';
import AssetsUseCase from './src/usecases/AssetsUseCase.js';

// Improve transparency support on Linux compositors
app.commandLine.appendSwitch('enable-transparent-visuals');
// Workaround sandbox issue in local dev environments
app.commandLine.appendSwitch('no-sandbox');

let mainWindow = null;

// Initialize Use Cases
const configUseCase = new ConfigUseCase();
const cryptoUseCase = new CryptoUseCase();
const databaseUseCase = new DatabaseUseCase(cryptoUseCase);
const audioMonitorUseCase = new AudioMonitorUseCase();
const windowManagementUseCase = new WindowManagementUseCase(configUseCase);
const googleOAuthUseCase = new GoogleOAuthUseCase();
const assetsUseCase = new AssetsUseCase();

function createMainWindow() {
	mainWindow = windowManagementUseCase.createMainWindow();
	// Set the main window reference in audio monitor for callbacks
	audioMonitorUseCase.setMainWindow(mainWindow);
	windowManagementUseCase.setMainWindow(mainWindow);
	return mainWindow;
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
				mainWindow.setShape([]); // limpa shape atual
				mainWindow.webContents.send('overlay:mode-smart');
			} else {
				// Modo clique real em toda a janela
				mainWindow.setIgnoreMouseEvents(false);
				const [w, h] = mainWindow.getSize();
				mainWindow.setShape([{ x: 0, y: 0, width: w, height: h }]);
			}
		});
	} catch {}
});

app.on('window-all-closed', () => {
	app.quit();
});

// Audio Monitor IPC handlers
ipcMain.handle('audio:start-monitor', (_evt, { openaiKey, segmentSeconds }) => 
	audioMonitorUseCase.startAudioMonitor({ openaiKey, segmentSeconds }));
ipcMain.handle('audio:stop-monitor', () => audioMonitorUseCase.stopAudioMonitor());
ipcMain.handle('audio:get-status', () => audioMonitorUseCase.getStatus());

// IPC: overlay controls
ipcMain.handle('overlay:set-ignore-mouse-events', (_evt, shouldIgnore, opts) => {
	windowManagementUseCase.setIgnoreMouseEvents(shouldIgnore, opts);
});

ipcMain.handle('overlay:set-always-on-top', () => {
	windowManagementUseCase.setAlwaysOnTop();
});

ipcMain.handle('overlay:toggle-fullscreen', () => {
	windowManagementUseCase.toggleFullscreen();
});

ipcMain.handle('overlay:set-content-protection', (_evt, enabled) => {
	return windowManagementUseCase.setContentProtection(enabled);
});

// IPC: displays and config
ipcMain.handle('overlay:get-displays', () => {
	return windowManagementUseCase.getDisplays();
});

ipcMain.handle('overlay:get-config', () => configUseCase.loadConfig());

ipcMain.handle('overlay:apply-display', (_evt, displayIndex) => {
	return windowManagementUseCase.applyDisplay(displayIndex);
});

ipcMain.handle('overlay:get-local-cursor', () => {
	return windowManagementUseCase.getLocalCursor();
});

ipcMain.handle('overlay:set-shape', (_evt, rects) => {
	windowManagementUseCase.setShape(rects);
});

ipcMain.handle('overlay:quit', () => {
	try { globalShortcut.unregisterAll(); } catch {}
	windowManagementUseCase.quit();
});

// Resolve asset file URL for renderer/webview
ipcMain.handle('assets:get-file-url', (_evt, relPath) => {
	return assetsUseCase.getFileUrl(relPath);
});

ipcMain.handle('assets:get-file-path', (_evt, relPath) => {
	return assetsUseCase.getFilePath(relPath);
});

ipcMain.handle('overlay:toggle-webview-devtools', (_evt, { webContentsId, dock = 'right' }) => {
	return windowManagementUseCase.toggleWebviewDevtools({ webContentsId, dock });
});

// Prompt Store IPC
ipcMain.handle('promptStore:save', async (_evt, { prompt, effect, validated, comments }) => {
	return await databaseUseCase.savePrompt({ prompt, effect, validated, comments });
});

ipcMain.handle('promptStore:list', async (_evt, { q } = {}) => {
	return await databaseUseCase.listPrompts({ q });
});

ipcMain.handle('promptStore:update', async (_evt, { id, validated, comments }) => {
	return await databaseUseCase.updatePrompt({ id, validated, comments });
});

// Links Repo IPC
ipcMain.handle('linkRepo:save', async (_evt, { title, url: linkUrl, tags, notes, favorite }) => {
	return await databaseUseCase.saveLink({ title, url: linkUrl, tags, notes, favorite });
});

ipcMain.handle('linkRepo:list', async (_evt, { q } = {}) => {
	return await databaseUseCase.listLinks({ q });
});

ipcMain.handle('linkRepo:update', async (_evt, { id, title, url: linkUrl, tags, notes, favorite }) => {
	return await databaseUseCase.updateLink({ id, title, url: linkUrl, tags, notes, favorite });
});

// ChatGPT Config IPC (with encryption)
ipcMain.handle('chatgpt:get-config', async () => {
	return await databaseUseCase.getChatGptConfig();
});

ipcMain.handle('chatgpt:save-config', async (_evt, { apiKey, model }) => {
	// Save marker file for debugging
	try {
		const marker = path.join(app.getPath('userData'), 'last-chatgpt-save.json');
		fs.writeFileSync(marker, JSON.stringify({ when: new Date().toISOString(), model: String(model || 'gpt-4o-mini'), setKey: !!String(apiKey || '').trim() }, null, 2));
	} catch {}
	return await databaseUseCase.saveChatGptConfig({ apiKey, model });
});

// Google OAuth IPC handlers
ipcMain.handle('gcal:begin-auth', async (_evt, { clientId, clientSecret }) => {
	return await googleOAuthUseCase.beginAuth({ clientId, clientSecret });
});

ipcMain.handle('gcal:finish-auth', async (_evt, { clientId, clientSecret, authCode }) => {
	return await googleOAuthUseCase.finishAuth({ clientId, clientSecret, authCode });
});

ipcMain.handle('gcal:auth-auto', async (_evt, { clientId, clientSecret }) => {
	return await googleOAuthUseCase.authAuto({ clientId, clientSecret });
});

ipcMain.handle('gcal:list-events', async (_evt, { clientId, clientSecret, calendarId = 'primary' }) => {
	return await googleOAuthUseCase.listEvents({ clientId, clientSecret, calendarId });
}); 