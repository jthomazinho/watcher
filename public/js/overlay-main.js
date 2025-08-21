// Import use cases - Note: These will need to be adapted for browser module loading
// For now, we'll include them directly or use a bundler

class OverlayApplication {
	constructor() {
		this.overlayAPI = window.overlay;
		this.useCases = {};
		this.elements = {};
		this.initialized = false;
	}

	async initialize() {
		if (this.initialized) return;

		// Get DOM elements
		this.getDOMElements();

		// Initialize use cases with dependencies
		this.initializeUseCases();

		// Setup use cases
		this.setupUseCases();

		// Setup application controls
		this.setupApplicationControls();

		this.initialized = true;
		console.log('Overlay application initialized');
	}

	getDOMElements() {
		this.elements = {
			root: document.getElementById('root'),
			taskbar: document.getElementById('taskbar'),
			handle: document.getElementById('handle'),
			webviewWrapper: document.getElementById('webview-wrap'),
			webview: document.getElementById('dashboard'),
			buttons: {
				dashboard: document.getElementById('btnTabDashboard'),
				agenda: document.getElementById('btnTabAgenda'),
				chatgpt: document.getElementById('btnTabChatGPT'),
				settings: document.getElementById('btnTabSettings'),
				trading: document.getElementById('btnTabTrading'),
				lib: document.getElementById('btnTabLib'),
				qual: document.getElementById('btnTabQual'),
				close: document.getElementById('btnClose'),
				devtools: document.getElementById('btnDevTools')
			}
		};
	}

	initializeUseCases() {
		// Initialize use cases in dependency order
		this.useCases.shapeManager = new ShapeManagementUseCase(this.overlayAPI);
		this.useCases.taskbarManager = new TaskbarManagementUseCase(this.useCases.shapeManager);
		this.useCases.webviewManager = new WebviewManagementUseCase(this.overlayAPI);
		this.useCases.tabNavigation = new TabNavigationUseCase(
			this.useCases.webviewManager, 
			this.useCases.shapeManager, 
			this.overlayAPI
		);
		this.useCases.mouseInteraction = new MouseInteractionUseCase(
			this.useCases.shapeManager, 
			this.overlayAPI
		);
	}

	setupUseCases() {
		// Initialize each use case with required elements
		this.useCases.taskbarManager.initialize(this.elements.taskbar, this.elements.handle);
		this.useCases.webviewManager.initialize(this.elements.webview);
		this.useCases.tabNavigation.initialize(this.elements.webviewWrapper, this.elements.buttons);
		this.useCases.mouseInteraction.initialize();
	}

	setupApplicationControls() {
		// Close button
		if (this.elements.buttons.close) {
			this.elements.buttons.close.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				try { 
					await this.overlayAPI.quit(); 
				} catch {}
				// Fallback se algo impedir o IPC
				setTimeout(() => { 
					try { window.close(); } catch {} 
				}, 200);
			});
		}

		// DevTools button
		if (this.elements.buttons.devtools) {
			this.elements.buttons.devtools.addEventListener('click', async () => {
				await this.useCases.webviewManager.toggleDevTools();
			});
		}
	}

	// Public API methods
	async updateWindowShape() {
		return await this.useCases.shapeManager.updateWindowShape();
	}

	showTaskbar() {
		return this.useCases.taskbarManager.showTaskbar();
	}

	hideTaskbar() {
		return this.useCases.taskbarManager.hideTaskbar();
	}

	async selectTab(tabName) {
		return await this.useCases.tabNavigation.selectTabByName(tabName);
	}

	getCurrentTab() {
		return this.useCases.tabNavigation.getCurrentTab();
	}

	getAvailableTabs() {
		return this.useCases.tabNavigation.getAvailableTabs();
	}

	setSmartMode(enabled) {
		return this.useCases.mouseInteraction.setSmartMode(enabled);
	}

	getSmartMode() {
		return this.useCases.mouseInteraction.getSmartMode();
	}

	async getCurrentMousePosition() {
		return await this.useCases.mouseInteraction.getCurrentMousePosition();
	}

	isTaskbarHidden() {
		return this.useCases.taskbarManager.isHidden();
	}

	async toggleDevTools() {
		return await this.useCases.webviewManager.toggleDevTools();
	}

	// Expose some methods globally for backward compatibility
	exposeGlobalMethods() {
		window.updateWindowShape = () => this.updateWindowShape();
		window.overlayApp = this;
	}

	destroy() {
		// Cleanup all use cases
		Object.values(this.useCases).forEach(useCase => {
			if (useCase.destroy) {
				useCase.destroy();
			}
		});
	}
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
	// Create and initialize the application
	const app = new OverlayApplication();
	await app.initialize();
	app.exposeGlobalMethods();
});

// Also handle the case where DOM is already loaded
if (document.readyState === 'loading') {
	// DOM hasn't loaded yet
} else {
	// DOM has already loaded
	setTimeout(async () => {
		if (!window.overlayApp) {
			const app = new OverlayApplication();
			await app.initialize();
			app.exposeGlobalMethods();
		}
	}, 0);
} 