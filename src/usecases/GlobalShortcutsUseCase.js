import { globalShortcut } from 'electron';

class GlobalShortcutsUseCase {
	constructor(windowManagementUseCase) {
		this.windowManagementUseCase = windowManagementUseCase;
		this.smartMode = true; // true: click-through por shape; false: captura total
		this.shortcuts = new Map();
	}

	registerToggleModeShortcut() {
		try {
			globalShortcut.register('Control+B', () => {
				this.toggleInteractionMode();
			});
			this.shortcuts.set('Control+B', 'toggleInteractionMode');
			return { ok: true, shortcut: 'Control+B', action: 'toggleInteractionMode' };
		} catch (error) {
			return { ok: false, error: error.message };
		}
	}

	toggleInteractionMode() {
		const mainWindow = this.windowManagementUseCase.getMainWindow();
		if (!mainWindow) return { ok: false, error: 'No main window available' };

		this.smartMode = !this.smartMode;
		
		if (this.smartMode) {
			// Volta para modo shape inteligente: renderer recalcula shape
			mainWindow.setIgnoreMouseEvents(false);
			mainWindow.setShape([]); // limpa shape atual
			mainWindow.webContents.send('overlay:mode-smart');
			return { ok: true, mode: 'smart', description: 'Smart click-through mode enabled' };
		} else {
			// Modo clique real em toda a janela
			mainWindow.setIgnoreMouseEvents(false);
			const [w, h] = mainWindow.getSize();
			mainWindow.setShape([{ x: 0, y: 0, width: w, height: h }]);
			return { ok: true, mode: 'full-capture', description: 'Full window capture mode enabled' };
		}
	}

	registerCustomShortcut(keys, callback, description = '') {
		try {
			globalShortcut.register(keys, callback);
			this.shortcuts.set(keys, description || 'custom');
			return { ok: true, shortcut: keys, description };
		} catch (error) {
			return { ok: false, error: error.message };
		}
	}

	unregisterShortcut(keys) {
		try {
			globalShortcut.unregister(keys);
			this.shortcuts.delete(keys);
			return { ok: true, shortcut: keys };
		} catch (error) {
			return { ok: false, error: error.message };
		}
	}

	unregisterAllShortcuts() {
		try {
			globalShortcut.unregisterAll();
			this.shortcuts.clear();
			return { ok: true };
		} catch (error) {
			return { ok: false, error: error.message };
		}
	}

	getRegisteredShortcuts() {
		return Array.from(this.shortcuts.entries()).map(([keys, description]) => ({
			keys,
			description
		}));
	}

	getCurrentMode() {
		return {
			mode: this.smartMode ? 'smart' : 'full-capture',
			description: this.smartMode 
				? 'Smart click-through mode - shape-based interaction'
				: 'Full capture mode - entire window interactive'
		};
	}

	setMode(mode) {
		if (mode === 'smart' && !this.smartMode) {
			this.toggleInteractionMode();
		} else if (mode === 'full-capture' && this.smartMode) {
			this.toggleInteractionMode();
		}
		return this.getCurrentMode();
	}
}

export default GlobalShortcutsUseCase; 