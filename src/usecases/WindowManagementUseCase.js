import { BrowserWindow, screen, webContents } from 'electron';
import path from 'path';
import url from 'url';
import { app } from 'electron';

class WindowManagementUseCase {
	constructor(configUseCase) {
		this.configUseCase = configUseCase;
		this.mainWindow = null;
	}

	setMainWindow(mainWindow) {
		this.mainWindow = mainWindow;
	}

	getMainWindow() {
		return this.mainWindow;
	}

	enforceAlwaysOnTop(win) {
		if (!win) return;
		// 'screen-saver' tends to stay above most windows, including fullscreen
		win.setAlwaysOnTop(true, 'screen-saver');
		// Keep on all workspaces and over fullscreen spaces when possible
		try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
	}

	positionWindowOnTargetDisplay(win) {
		const cfg = this.configUseCase.loadConfig();
		const displays = screen.getAllDisplays();
		const primary = screen.getPrimaryDisplay();
		let target = primary;
		if (typeof cfg.displayIndex === 'number' && displays[cfg.displayIndex]) {
			target = displays[cfg.displayIndex];
		}
		const b = target.bounds;
		win.setFullScreen(false);
		win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height }, false);
		if (cfg.fullscreen !== false) {
			win.setFullScreen(true);
		}
		this.enforceAlwaysOnTop(win);
	}

	createMainWindow() {
		const cfg = this.configUseCase.loadConfig();
		const displays = screen.getAllDisplays();
		const primary = screen.getPrimaryDisplay();
		let target = primary;
		if (typeof cfg.displayIndex === 'number' && displays[cfg.displayIndex]) {
			target = displays[cfg.displayIndex];
		}
		const b = target.bounds;

		this.mainWindow = new BrowserWindow({
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
				preload: path.join(app.getAppPath(), 'preload.js'),
				nodeIntegration: false,
				contextIsolation: true,
				webviewTag: true,
				devTools: true,
			}
		});

		this.mainWindow.setMenuBarVisibility(false);
		// Capture events and rely on setShape for click-through
		this.mainWindow.setIgnoreMouseEvents(false);
		// Apply content protection based on config
		try { this.mainWindow.setContentProtection(Boolean(cfg.contentProtection)); } catch {}
		this.enforceAlwaysOnTop(this.mainWindow);

		const indexUrl = url.pathToFileURL(path.join(app.getAppPath(), 'public/index.html')).toString();
		this.mainWindow.loadURL(indexUrl);

		this.mainWindow.once('ready-to-show', () => {
			// Apply fullscreen and always-on-top after initial layout for the target monitor
			this.positionWindowOnTargetDisplay(this.mainWindow);
			this.mainWindow?.showInactive();
		});

		// Re-apply always-on-top on common state changes
		this.mainWindow.on('show', () => this.enforceAlwaysOnTop(this.mainWindow));
		this.mainWindow.on('focus', () => this.enforceAlwaysOnTop(this.mainWindow));
		this.mainWindow.on('blur', () => this.enforceAlwaysOnTop(this.mainWindow));
		this.mainWindow.on('enter-full-screen', () => this.enforceAlwaysOnTop(this.mainWindow));
		this.mainWindow.on('leave-full-screen', () => this.enforceAlwaysOnTop(this.mainWindow));

		this.mainWindow.on('closed', () => {
			this.mainWindow = null;
		});

		return this.mainWindow;
	}

	setIgnoreMouseEvents(shouldIgnore, opts) {
		if (!this.mainWindow) return;
		const ignore = Boolean(shouldIgnore);
		const options = ignore ? { forward: true, ...(opts || {}) } : undefined;
		this.mainWindow.setIgnoreMouseEvents(ignore, options);
	}

	setAlwaysOnTop() {
		// Enforce always-on-top regardless of requested value
		if (!this.mainWindow) return;
		this.enforceAlwaysOnTop(this.mainWindow);
	}

	toggleFullscreen() {
		if (!this.mainWindow) return;
		const cfg = this.configUseCase.loadConfig();
		const newVal = !this.mainWindow.isFullScreen();
		this.mainWindow.setFullScreen(newVal);
		this.enforceAlwaysOnTop(this.mainWindow);
		this.configUseCase.saveConfig({ ...cfg, fullscreen: newVal });
	}

	setContentProtection(enabled) {
		if (!this.mainWindow) return;
		const cfg = this.configUseCase.loadConfig();
		try { this.mainWindow.setContentProtection(Boolean(enabled)); } catch {}
		this.configUseCase.saveConfig({ ...cfg, contentProtection: Boolean(enabled) });
		return { ok: true };
	}

	getDisplays() {
		const displays = screen.getAllDisplays();
		const primaryId = screen.getPrimaryDisplay().id;
		return displays.map((d, index) => ({
			id: d.id,
			index,
			bounds: d.bounds,
			isPrimary: d.id === primaryId,
			label: `${index + 1} - ${d.bounds.width}x${d.bounds.height} @ ${d.bounds.x},${d.bounds.y}${d.id === primaryId ? ' (primário)' : ''}`
		}));
	}

	applyDisplay(displayIndex) {
		const displays = screen.getAllDisplays();
		if (typeof displayIndex !== 'number' || !displays[displayIndex]) return { ok: false };
		const cfg = this.configUseCase.loadConfig();
		this.configUseCase.saveConfig({ ...cfg, displayIndex });
		if (this.mainWindow) {
			this.positionWindowOnTargetDisplay(this.mainWindow);
		}
		return { ok: true };
	}

	getLocalCursor() {
		if (!this.mainWindow) return { x: 0, y: 0 };
		try {
			const { x, y } = screen.getCursorScreenPoint();
			const [wx, wy] = this.mainWindow.getPosition();
			return { x: x - wx, y: y - wy };
		} catch {
			return { x: 0, y: 0 };
		}
	}

	setShape(rects) {
		if (!this.mainWindow) return;
		try {
			// rects: [{x,y,width,height}] in DIP coordinates
			this.mainWindow.setShape(Array.isArray(rects) ? rects : []);
		} catch {}
	}

	toggleWebviewDevtools({ webContentsId, dock = 'right' }) {
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
				target.openDevTools({ mode: dock });
				open = true;
			}
			try { this.mainWindow?.webContents.send('overlay:webview-devtools-state', { open }); } catch {}
			return { ok: true };
		} catch (e) {
			return { ok: false, error: e?.message };
		}
	}

	quit() {
		try { if (this.mainWindow && !this.mainWindow.isDestroyed()) this.mainWindow.destroy(); } catch {}
		try { app.quit(); } catch {}
		setTimeout(() => { try { app.exit(0); } catch {} }, 50);
	}
}

export default WindowManagementUseCase; 