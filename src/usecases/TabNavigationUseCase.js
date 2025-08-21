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

		// Dashboard Tab
		if (this.buttons.dashboard) {
			this.buttons.dashboard.addEventListener('click', async () => {
				await this.selectDashboardTab();
			});
		}

		// Agenda Tab
		if (this.buttons.agenda) {
			this.buttons.agenda.addEventListener('click', async () => {
				await this.selectAgendaTab();
			});
		}

		// ChatGPT Tab
		if (this.buttons.chatgpt) {
			this.buttons.chatgpt.addEventListener('click', async () => {
				await this.selectChatGPTTab();
			});
		}

		// Settings Tab
		if (this.buttons.settings) {
			this.buttons.settings.addEventListener('click', async () => {
				await this.selectSettingsTab();
			});
		}

		// Trading Tab
		if (this.buttons.trading) {
			this.buttons.trading.addEventListener('click', async () => {
				await this.selectTradingTab();
			});
		}

		// Lib Tab
		if (this.buttons.lib) {
			this.buttons.lib.addEventListener('click', async () => {
				await this.selectLibTab();
			});
		}

		// Qual Tab
		if (this.buttons.qual) {
			this.buttons.qual.addEventListener('click', async () => {
				await this.selectQualTab();
			});
		}
	}

	async selectDashboardTab() {
		this.currentTab = 'dashboard';
		this.showWebviewWrapper();
		// full width
		this.setWebviewWrapperStyle('40px', '40px');
		await this.webviewManager.ensureDashboardLoaded();
		this.shapeManager.updateWindowShape();
		return { tab: 'dashboard', style: 'full-width' };
	}

	async selectAgendaTab() {
		this.currentTab = 'agenda';
		this.showWebviewWrapper();
		// full width
		this.setWebviewWrapperStyle('40px', '40px');
		await this.webviewManager.ensureDashboardLoaded();
		await this.webviewManager.selectTab('calendar');
		this.shapeManager.updateWindowShape();
		return { tab: 'agenda', style: 'full-width', section: 'calendar' };
	}

	async selectChatGPTTab() {
		this.currentTab = 'chatgpt';
		this.showWebviewWrapper();
		// left half of the screen
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

	hideWebviewWrapper() {
		if (this.webviewWrapper) {
			this.webviewWrapper.classList.add('hidden');
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

export default TabNavigationUseCase; 