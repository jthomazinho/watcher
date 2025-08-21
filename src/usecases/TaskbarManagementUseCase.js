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

		// Hover no handle reexibe a taskbar
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

	forceShow() {
		this.cancelAutoHide();
		return this.showTaskbar();
	}

	forceHide() {
		this.cancelAutoHide();
		return this.hideTaskbar();
	}

	setAutoHideDelay(delayMs) {
		this.autoHideDelay = delayMs;
		// Reagendar se há um timer ativo
		if (this.hideTimer) {
			this.cancelAutoHide();
			this.scheduleAutoHide();
		}
	}

	destroy() {
		this.cancelAutoHide();
		// Remove event listeners se necessário
		if (this.taskbar) {
			this.taskbar.removeEventListener('mouseenter', this.cancelAutoHide);
			this.taskbar.removeEventListener('mouseleave', this.scheduleAutoHide);
		}
	}
}

export default TaskbarManagementUseCase; 