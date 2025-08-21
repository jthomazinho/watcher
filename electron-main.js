import { app, BrowserWindow, ipcMain, shell, screen, webContents } from 'electron';
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
import GlobalShortcutsUseCase from './src/usecases/GlobalShortcutsUseCase.js';

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
const globalShortcutsUseCase = new GlobalShortcutsUseCase(windowManagementUseCase);

function createMainWindow() {
	mainWindow = windowManagementUseCase.createMainWindow();
	// Set the main window reference in audio monitor for callbacks
	audioMonitorUseCase.setMainWindow(mainWindow);
	windowManagementUseCase.setMainWindow(mainWindow);
	return mainWindow;
}

app.on('ready', () => {
	createMainWindow();
	// Register global shortcuts
	globalShortcutsUseCase.registerToggleModeShortcut();
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
	globalShortcutsUseCase.unregisterAllShortcuts();
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

// Global Shortcuts IPC handlers
ipcMain.handle('shortcuts:toggle-interaction-mode', () => {
	return globalShortcutsUseCase.toggleInteractionMode();
});

ipcMain.handle('shortcuts:get-current-mode', () => {
	return globalShortcutsUseCase.getCurrentMode();
});

ipcMain.handle('shortcuts:set-mode', (_evt, { mode }) => {
	return globalShortcutsUseCase.setMode(mode);
});

ipcMain.handle('shortcuts:get-registered', () => {
	return globalShortcutsUseCase.getRegisteredShortcuts();
});

ipcMain.handle('shortcuts:register-custom', (_evt, { keys, description }) => {
	// Note: This would need a callback function to be useful
	// For now, just return the registration status
	return { ok: false, error: 'Custom shortcuts with callbacks not supported via IPC' };
});

ipcMain.handle('shortcuts:unregister', (_evt, { keys }) => {
	return globalShortcutsUseCase.unregisterShortcut(keys);
}); 