// Frontend Use Cases Bundle
// This file contains all use cases adapted for browser consumption

// ShapeManagementUseCase
class ShapeManagementUseCase {
	constructor(overlayAPI) {
		this.overlayAPI = overlayAPI;
	}

	parseAlpha(color) {
		if (!color) return 0;
		if (color === 'transparent') return 0;
		const m = color.match(/rgba?\(([^)]+)\)/);
		if (!m) return 0;
		const parts = m[1].split(',').map(s => s.trim());
		if (parts.length === 4) return Math.max(0, Math.min(1, parseFloat(parts[3]) || 0));
		return 1;
	}

	hasOpaqueVisual(el) {
		const cs = getComputedStyle(el);
		if (cs.visibility === 'hidden' || cs.display === 'none') return false;
		const opacity = parseFloat(cs.opacity || '1');
		if (opacity < 0.5) return false;
		if (cs.backgroundImage !== 'none') return true;
		if (this.parseAlpha(cs.backgroundColor) >= 0.5) return true;
		const widths = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(w => parseFloat(w) || 0);
		if (widths.some(w => w > 0)) {
			const colors = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
			if (colors.some(c => this.parseAlpha(c) >= 0.5)) return true;
		}
		return false;
	}

	isPointInRect(x, y, r) { 
		return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; 
	}

	getInteractiveRoots() { 
		return Array.from(document.querySelectorAll('.interactive')); 
	}

	isInInteractiveRect(x, y) {
		for (const el of this.getInteractiveRoots()) {
			const cs = getComputedStyle(el);
			if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || parseFloat(cs.opacity || '1') === 0) continue;
			const r = el.getBoundingClientRect();
			if (r.width <= 0 || r.height <= 0) continue;
			if (this.isPointInRect(x, y, r)) return true;
		}
		return false;
	}

	isOpaqueAtPoint(x, y) {
		if (this.isInInteractiveRect(x, y)) return true;
		const stack = document.elementsFromPoint(x, y);
		if (!stack || stack.length === 0) return false;
		if (stack.some(el => el.tagName === 'WEBVIEW')) return true;
		for (const el of stack) {
			if (el === document.documentElement || el === document.body || el.id === 'root') continue;
			if (this.hasOpaqueVisual(el)) return true;
		}
		return false;
	}

	isTransparentClick(x, y) {
		return !this.isOpaqueAtPoint(x, y);
	}

	async updateWindowShape() {
		const rects = [];
		const nodes = document.querySelectorAll('.interactive');
		for (const el of nodes) {
			if (el.id === 'root') continue;
			const cs = getComputedStyle(el);
			if (cs.visibility === 'hidden' || cs.display === 'none') continue;
			const opacity = parseFloat(cs.opacity || '1');
			const bgAlpha = this.parseAlpha(cs.backgroundColor);
			const borderColors = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
			const borderWidths = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(w => parseFloat(w) || 0);
			const borderAlpha = borderColors.some(c => this.parseAlpha(c) >= 0.5) && borderWidths.some(w => w > 0) ? 1 : 0;
			const hasImage = cs.backgroundImage && cs.backgroundImage !== 'none';
			const isWebview = el.tagName === 'WEBVIEW' || el.querySelector && el.querySelector('webview');
			const isOpaqueEnough = isWebview || hasImage || opacity >= 0.5 || bgAlpha >= 0.5 || borderAlpha >= 0.5;
			if (!isOpaqueEnough) continue;
			const r = el.getBoundingClientRect();
			if (r.width <= 0 || r.height <= 0) continue;
			const x0 = Math.round(r.left);
			const y0 = Math.round(r.top);
			const w = Math.round(r.width);
			const h = Math.round(r.height);
			const tl = parseFloat(cs.borderTopLeftRadius) || 0;
			const tr = parseFloat(cs.borderTopRightRadius) || 0;
			const br = parseFloat(cs.borderBottomRightRadius) || 0;
			const bl = parseFloat(cs.borderBottomLeftRadius) || 0;
			const rMax = Math.round(Math.min(w / 2, h / 2, Math.max(tl, tr, br, bl)));
			if (rMax > 0) {
				rects.push({ x: x0 + rMax, y: y0, width: Math.max(0, w - 2 * rMax), height: h });
				rects.push({ x: x0, y: y0 + rMax, width: rMax, height: Math.max(0, h - 2 * rMax) });
				rects.push({ x: x0 + w - rMax, y: y0 + rMax, width: rMax, height: Math.max(0, h - 2 * rMax) });
			} else {
				rects.push({ x: x0, y: y0, width: w, height: h });
			}
		}
		await this.overlayAPI.setShape(rects);
		return rects;
	}
}

// TaskbarManagementUseCase
class TaskbarManagementUseCase {
	constructor(shapeManager) {
		this.shapeManager = shapeManager;
		this.hidden = false;
		this.hideTimer = null;
		this.taskbar = null;
		this.handle = null;
	}

	initialize(taskbarElement, handleElement) {
		this.taskbar = taskbarElement;
		this.handle = handleElement;
		this.setupEventListeners();
		this.hideTaskbar();
		this.scheduleAutoHide();
	}

	setupEventListeners() {
		if (!this.taskbar || !this.handle) return;

		this.handle.addEventListener('mouseenter', () => {
			if (this.hidden) this.showTaskbar();
		});
		
		this.taskbar.addEventListener('mouseenter', () => this.cancelAutoHide());
		this.taskbar.addEventListener('mouseleave', () => this.scheduleAutoHide());
	}

	scheduleAutoHide() {
		if (this.hideTimer) clearTimeout(this.hideTimer);
		this.hideTimer = setTimeout(() => { 
			if (!this.hidden) this.hideTaskbar(); 
		}, 5000);
	}

	cancelAutoHide() { 
		if (this.hideTimer) { 
			clearTimeout(this.hideTimer); 
			this.hideTimer = null; 
		} 
	}

	showTaskbar() {
		if (!this.taskbar || !this.handle) return;
		
		this.hidden = false;
		this.taskbar.classList.remove('hidden');
		this.handle.classList.add('hidden');
		this.shapeManager.updateWindowShape();
		this.cancelAutoHide();
		this.scheduleAutoHide();
		
		return { hidden: this.hidden, action: 'show' };
	}

	hideTaskbar() {
		if (!this.taskbar || !this.handle) return;
		
		this.hidden = true;
		this.taskbar.classList.add('hidden');
		this.handle.classList.remove('hidden');
		this.shapeManager.updateWindowShape();
		this.cancelAutoHide();
		
		return { hidden: this.hidden, action: 'hide' };
	}

	toggleTaskbar() {
		return this.hidden ? this.showTaskbar() : this.hideTaskbar();
	}

	isHidden() {
		return this.hidden;
	}
}

// WebviewManagementUseCase
class WebviewManagementUseCase {
	constructor(overlayAPI) {
		this.overlayAPI = overlayAPI;
		this.webview = null;
		this.devToolsOpen = false;
	}

	initialize(webviewElement) {
		this.webview = webviewElement;
		this.setupDevToolsMonitoring();
	}

	async ensureDashboardLoaded() {
		return new Promise((resolve) => {
			if (!this.webview) return resolve(false);
			try {
				const currentUrl = this.webview.getURL && this.webview.getURL();
				if (currentUrl && currentUrl !== 'about:blank') return resolve(true);
				this.webview.addEventListener('did-finish-load', () => resolve(true), { once: true });
				this.loadDashboard();
			} catch { 
				resolve(false); 
			}
		});
	}

	async loadDashboard() {
		if (!this.webview) return;
		
		try {
			const preloadPath = await this.overlayAPI.getAssetFilePath('public/webview-preload.js');
			const pageUrl = await this.overlayAPI.getAssetFileUrl('public/dashboard.html');
			if (preloadPath) this.webview.setAttribute('preload', preloadPath);
			if (pageUrl) this.webview.src = pageUrl; 
			else this.webview.src = './dashboard.html';
		} catch {
			this.webview.src = './dashboard.html';
		}
	}

	async selectTab(tabName) {
		if (!this.webview) return false;
		await this.ensureDashboardLoaded();
		const code = `window.showSection && window.showSection(${JSON.stringify(tabName)});`;
		try {
			await this.webview.executeJavaScript(code);
			return true;
		} catch {
			return false;
		}
	}

	async toggleDevTools() {
		if (!this.webview) return { ok: false, error: 'No webview available' };

		try {
			if (this.webview.isLoading && this.webview.isLoading()) { 
				this.webview.addEventListener('did-finish-load', () => this.toggleDevTools(), { once: true }); 
				return { ok: true, status: 'waiting_for_load' };
			}

			const id = this.webview.getWebContentsId && this.webview.getWebContentsId();
			if (!id) { 
				try { 
					if (this.webview.isDevToolsOpened && this.webview.isDevToolsOpened()) {
						this.webview.closeDevTools();
						this.devToolsOpen = false;
					} else {
						this.webview.openDevTools({ mode: 'right' });
						this.devToolsOpen = true;
					}
					window.__webviewDevtoolsOpen = this.devToolsOpen;
					return { ok: true, open: this.devToolsOpen, method: 'direct' };
				} catch(e) {
					return { ok: false, error: e.message };
				}
			}

			const result = await this.overlayAPI.toggleWebviewDevTools({ webContentsId: id, dock: 'right' });
			return { ok: true, ...result, method: 'ipc' };
		} catch (error) {
			return { ok: false, error: error.message };
		}
	}

	setupDevToolsMonitoring() {
		setInterval(() => {
			if (window.__webviewDevtoolsOpen) {
				try {
					const wrap = document.getElementById('webview-wrap');
					if (wrap) {
						wrap.classList.remove('hidden');
						if (typeof updateWindowShape === 'function') {
							updateWindowShape();
						}
					}
				} catch {}
			}
		}, 500);
	}
}

// TabNavigationUseCase
class TabNavigationUseCase {
	constructor(webviewManager, shapeManager, overlayAPI) {
		this.webviewManager = webviewManager;
		this.shapeManager = shapeManager;
		this.overlayAPI = overlayAPI;
		this.currentTab = null;
		this.webviewWrapper = null;
		this.buttons = {};
	}

	initialize(webviewWrapperElement, buttonElements) {
		this.webviewWrapper = webviewWrapperElement;
		this.buttons = buttonElements;
		this.setupTabButtons();
	}

	setupTabButtons() {
		if (!this.buttons) return;

		if (this.buttons.dashboard) {
			this.buttons.dashboard.addEventListener('click', () => this.selectDashboardTab());
		}
		if (this.buttons.agenda) {
			this.buttons.agenda.addEventListener('click', () => this.selectAgendaTab());
		}
		if (this.buttons.chatgpt) {
			this.buttons.chatgpt.addEventListener('click', () => this.selectChatGPTTab());
		}
		if (this.buttons.settings) {
			this.buttons.settings.addEventListener('click', () => this.selectSettingsTab());
		}
		if (this.buttons.trading) {
			this.buttons.trading.addEventListener('click', () => this.selectTradingTab());
		}
		if (this.buttons.lib) {
			this.buttons.lib.addEventListener('click', () => this.selectLibTab());
		}
		if (this.buttons.qual) {
			this.buttons.qual.addEventListener('click', () => this.selectQualTab());
		}
	}

	async selectDashboardTab() {
		this.currentTab = 'dashboard';
		this.showWebviewWrapper();
		this.setWebviewWrapperStyle('40px', '40px');
		await this.webviewManager.ensureDashboardLoaded();
		this.shapeManager.updateWindowShape();
		return { tab: 'dashboard', style: 'full-width' };
	}

	async selectAgendaTab() {
		this.currentTab = 'agenda';
		this.showWebviewWrapper();
		this.setWebviewWrapperStyle('40px', '40px');
		await this.webviewManager.ensureDashboardLoaded();
		await this.webviewManager.selectTab('calendar');
		this.shapeManager.updateWindowShape();
		return { tab: 'agenda', style: 'full-width', section: 'calendar' };
	}

	async selectChatGPTTab() {
		this.currentTab = 'chatgpt';
		this.showWebviewWrapper();
		this.setWebviewWrapperStyle('40px', '50%');
		await this.webviewManager.ensureDashboardLoaded();
		await this.webviewManager.selectTab('chatgpt');
		this.shapeManager.updateWindowShape();
		return { tab: 'chatgpt', style: 'left-half', section: 'chatgpt' };
	}

	async selectSettingsTab() {
		this.currentTab = 'settings';
		this.showWebviewWrapper();
		this.setWebviewWrapperStyle('40px', '40px');
		await this.webviewManager.ensureDashboardLoaded();
		await this.webviewManager.selectTab('settings');
		this.shapeManager.updateWindowShape();
		return { tab: 'settings', style: 'full-width', section: 'settings' };
	}

	async selectTradingTab() {
		this.currentTab = 'trading';
		this.showWebviewWrapper();
		this.setWebviewWrapperStyle('40px', '40px');
		await this.webviewManager.ensureDashboardLoaded();
		await this.webviewManager.selectTab('trading');
		this.shapeManager.updateWindowShape();
		return { tab: 'trading', style: 'full-width', section: 'trading' };
	}

	async selectLibTab() {
		this.currentTab = 'lib';
		this.showWebviewWrapper();
		this.setWebviewWrapperStyle('40px', '40px');
		await this.webviewManager.ensureDashboardLoaded();
		await this.webviewManager.selectTab('lib');
		this.shapeManager.updateWindowShape();
		return { tab: 'lib', style: 'full-width', section: 'lib' };
	}

	async selectQualTab() {
		this.currentTab = 'qual';
		this.showWebviewWrapper();
		this.setWebviewWrapperStyle('40px', '40px');
		await this.webviewManager.ensureDashboardLoaded();
		await this.webviewManager.selectTab('qual');
		this.shapeManager.updateWindowShape();
		return { tab: 'qual', style: 'full-width', section: 'qual' };
	}

	async selectTabByName(tabName) {
		switch(tabName) {
			case 'dashboard': return await this.selectDashboardTab();
			case 'agenda': return await this.selectAgendaTab();
			case 'chatgpt': return await this.selectChatGPTTab();
			case 'settings': return await this.selectSettingsTab();
			case 'trading': return await this.selectTradingTab();
			case 'lib': return await this.selectLibTab();
			case 'qual': return await this.selectQualTab();
			default: throw new Error(`Unknown tab: ${tabName}`);
		}
	}

	showWebviewWrapper() {
		if (this.webviewWrapper) {
			this.webviewWrapper.classList.remove('hidden');
		}
	}

	setWebviewWrapperStyle(left, right) {
		if (this.webviewWrapper) {
			this.webviewWrapper.style.left = left;
			this.webviewWrapper.style.right = right;
		}
	}

	getCurrentTab() {
		return this.currentTab;
	}

	getAvailableTabs() {
		return ['dashboard', 'agenda', 'chatgpt', 'settings', 'trading', 'lib', 'qual'];
	}
}

// MouseInteractionUseCase
class MouseInteractionUseCase {
	constructor(shapeManager, overlayAPI) {
		this.shapeManager = shapeManager;
		this.overlayAPI = overlayAPI;
		this.smartMode = true;
		this.lastOpaque = null;
		this.polling = false;
	}

	initialize() {
		this.setupEventListeners();
		this.startCursorPolling();
		this.setupSmartModeListener();
	}

	setupEventListeners() {
		document.addEventListener('mousemove', (e) => this.onPointerMove(e));
		window.addEventListener('resize', () => this.shapeManager.updateWindowShape());
		new ResizeObserver(() => this.shapeManager.updateWindowShape()).observe(document.body);
	}

	onPointerMove(e) {
		this.updateMouseThroughAt(e.clientX, e.clientY);
	}

	updateMouseThroughAt(x, y) {
		if (!this.smartMode) return;
		const transparent = this.shapeManager.isTransparentClick(x, y);
		const opaque = !transparent;
		if (opaque !== this.lastOpaque) {
			this.lastOpaque = opaque;
		}
	}

	async startCursorPolling() {
		if (this.polling) return;
		this.polling = true;
		
		try {
			await new Promise(r => requestAnimationFrame(r));
			const { x, y } = await this.overlayAPI.getLocalCursor();
			this.updateMouseThroughAt(x, y);
		} catch {}

		while (this.polling) {
			try {
				const { x, y } = await this.overlayAPI.getLocalCursor();
				this.updateMouseThroughAt(x, y);
				await new Promise(r => setTimeout(r, 16));
			} catch {
				await new Promise(r => setTimeout(r, 50));
			}
		}
	}

	setSmartMode(enabled) {
		this.smartMode = enabled;
		if (this.smartMode) {
			this.shapeManager.updateWindowShape();
		}
		return { smartMode: this.smartMode };
	}

	getSmartMode() {
		return this.smartMode;
	}

	setupSmartModeListener() {
		window.__overlaySmartMode = true;
		const smartModeSetter = setInterval(() => {
			if (window.__overlaySmartMode) {
				this.smartMode = true;
				window.__overlaySmartMode = false;
				this.shapeManager.updateWindowShape();
			}
		}, 200);

		this.smartModeInterval = smartModeSetter;
	}

	async getCurrentMousePosition() {
		return this.overlayAPI.getLocalCursor();
	}
} 