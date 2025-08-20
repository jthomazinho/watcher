import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('overlay', {
	setIgnoreMouseEvents: (shouldIgnore, opts = {}) => ipcRenderer.invoke('overlay:set-ignore-mouse-events', shouldIgnore, opts),
	setAlwaysOnTop: (enabled) => ipcRenderer.invoke('overlay:set-always-on-top', enabled),
	toggleFullscreen: () => ipcRenderer.invoke('overlay:toggle-fullscreen'),
	getDisplays: () => ipcRenderer.invoke('overlay:get-displays'),
	getConfig: () => ipcRenderer.invoke('overlay:get-config'),
	applyDisplay: (displayIndex) => ipcRenderer.invoke('overlay:apply-display', displayIndex),
	getLocalCursor: () => ipcRenderer.invoke('overlay:get-local-cursor'),
	setShape: (rects) => ipcRenderer.invoke('overlay:set-shape', rects),
	setContentProtection: (enabled) => ipcRenderer.invoke('overlay:set-content-protection', enabled),
	quit: () => ipcRenderer.invoke('overlay:quit'),
	toggleWebviewDevTools: ({ webContentsId, dock = 'right' }) => ipcRenderer.invoke('overlay:toggle-webview-devtools', { webContentsId, dock }),
	promptStore: {
		save: ({ prompt, effect, validated, comments }) => ipcRenderer.invoke('promptStore:save', { prompt, effect, validated, comments }),
		list: ({ q } = {}) => ipcRenderer.invoke('promptStore:list', { q }),
		update: ({ id, validated, comments }) => ipcRenderer.invoke('promptStore:update', { id, validated, comments }),
	},
	linkRepo: {
		save: ({ title, url, tags, notes, favorite }) => ipcRenderer.invoke('linkRepo:save', { title, url, tags, notes, favorite }),
		list: ({ q } = {}) => ipcRenderer.invoke('linkRepo:list', { q }),
		update: ({ id, title, url, tags, notes, favorite }) => ipcRenderer.invoke('linkRepo:update', { id, title, url, tags, notes, favorite }),
	},
	audio: {
		start: ({ apiKey, segmentSeconds } = {}) => ipcRenderer.invoke('audio:start-monitor', { openaiKey: apiKey, segmentSeconds }),
		stop: () => ipcRenderer.invoke('audio:stop-monitor'),
		getStatus: () => ipcRenderer.invoke('audio:get-status'),
		onTranscript: (cb) => { ipcRenderer.on('audio:transcript-chunk', (_e, data) => { try { cb?.(data); } catch {} }); },
		onSummary: (cb) => { ipcRenderer.on('audio:summary-update', (_e, data) => { try { cb?.(data); } catch {} }); },
	},
	chatgpt: {
		getConfig: () => ipcRenderer.invoke('chatgpt:get-config'),
		saveConfig: ({ apiKey, model }) => ipcRenderer.invoke('chatgpt:save-config', { apiKey, model })
	},
	getChatgptConfig: () => ipcRenderer.invoke('chatgpt:get-config'),
	saveChatgptConfig: ({ apiKey, model }) => ipcRenderer.invoke('chatgpt:save-config', { apiKey, model }),
	getAssetFileUrl: (relPath) => ipcRenderer.invoke('assets:get-file-url', relPath),
	getAssetFilePath: (relPath) => ipcRenderer.invoke('assets:get-file-path', relPath)
});

contextBridge.exposeInMainWorld('gcal', {
	beginAuth: ({ clientId, clientSecret }) => ipcRenderer.invoke('gcal:begin-auth', { clientId, clientSecret }),
	finishAuth: ({ clientId, clientSecret, authCode }) => ipcRenderer.invoke('gcal:finish-auth', { clientId, clientSecret, authCode }),
	authAuto: ({ clientId, clientSecret }) => ipcRenderer.invoke('gcal:auth-auto', { clientId, clientSecret }),
	listEvents: ({ clientId, clientSecret, calendarId }) => ipcRenderer.invoke('gcal:list-events', { clientId, clientSecret, calendarId })
});

contextBridge.exposeInMainWorld('chatgpt', {
	getConfig: () => ipcRenderer.invoke('chatgpt:get-config'),
	saveConfig: ({ apiKey, model }) => ipcRenderer.invoke('chatgpt:save-config', { apiKey, model })
});

// one-way signal to renderer when mode toggled via global shortcut
ipcRenderer.on('overlay:mode-smart', () => {
	try { window.__overlaySmartMode = true; } catch {}
});

ipcRenderer.on('overlay:webview-devtools-state', (_e, { open }) => {
	try { window.__webviewDevtoolsOpen = !!open; } catch {}
}); 