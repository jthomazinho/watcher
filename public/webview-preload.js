import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bridge', {
	chatgpt: {
		getConfig: () => ipcRenderer.invoke('chatgpt:get-config'),
		saveConfig: ({ apiKey, model }) => ipcRenderer.invoke('chatgpt:save-config', { apiKey, model })
	}
}); 