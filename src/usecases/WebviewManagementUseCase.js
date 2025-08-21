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
			// ensure webview is ready
			if (this.webview.isLoading && this.webview.isLoading()) { 
				this.webview.addEventListener('did-finish-load', () => this.toggleDevTools(), { once: true }); 
				return { ok: true, status: 'waiting_for_load' };
			}

			const id = this.webview.getWebContentsId && this.webview.getWebContentsId();
			if (!id) { 
				// Fallback to direct webview methods
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
		// Ajuste de shape quando DevTools abre/fecha para manter clique no webview e devtools dockado
		setInterval(() => {
			if (window.__webviewDevtoolsOpen) {
				// expandir shape para toda a janela (evita área clicável reduzida)
				try {
					const wrap = document.getElementById('webview-wrap');
					if (wrap) {
						wrap.classList.remove('hidden');
						// Trigger shape update through global function if available
						if (typeof updateWindowShape === 'function') {
							updateWindowShape();
						}
					}
				} catch {}
			}
		}, 500);
	}

	isDevToolsOpen() {
		try {
			return this.webview && this.webview.isDevToolsOpened && this.webview.isDevToolsOpened();
		} catch {
			return this.devToolsOpen;
		}
	}

	getWebContentsId() {
		try {
			return this.webview && this.webview.getWebContentsId && this.webview.getWebContentsId();
		} catch {
			return null;
		}
	}

	getWebviewUrl() {
		try {
			return this.webview && this.webview.getURL && this.webview.getURL();
		} catch {
			return null;
		}
	}

	isWebviewLoading() {
		try {
			return this.webview && this.webview.isLoading && this.webview.isLoading();
		} catch {
			return false;
		}
	}

	executeJavaScript(code) {
		if (!this.webview) return Promise.reject(new Error('No webview available'));
		return this.webview.executeJavaScript(code);
	}

	reload() {
		if (this.webview && this.webview.reload) {
			this.webview.reload();
			return true;
		}
		return false;
	}

	goBack() {
		if (this.webview && this.webview.goBack && this.webview.canGoBack()) {
			this.webview.goBack();
			return true;
		}
		return false;
	}

	goForward() {
		if (this.webview && this.webview.goForward && this.webview.canGoForward()) {
			this.webview.goForward();
			return true;
		}
		return false;
	}
}

export default WebviewManagementUseCase; 