class MouseInteractionUseCase {
	constructor(shapeManager, overlayAPI) {
		this.shapeManager = shapeManager;
		this.overlayAPI = overlayAPI;
		this.smartMode = true;
		this.lastOpaque = null;
		this.polling = false;
		this.pollingInterval = null;
	}

	initialize() {
		this.setupEventListeners();
		this.startCursorPolling();
		this.setupSmartModeListener();
	}

	setupEventListeners() {
		document.addEventListener('mousemove', (e) => this.onPointerMove(e));
		window.addEventListener('resize', () => this.shapeManager.updateWindowShape());
		
		// ResizeObserver for shape updates
		new ResizeObserver(() => this.shapeManager.updateWindowShape()).observe(document.body);
	}

	onPointerMove(e) {
		this.updateMouseThroughAt(e.clientX, e.clientY);
	}

	updateMouseThroughAt(x, y) {
		if (!this.smartMode) return; // em modo clique real, shape cobre toda a janela
		const transparent = this.shapeManager.isTransparentClick(x, y);
		const opaque = !transparent;
		if (opaque !== this.lastOpaque) {
			this.lastOpaque = opaque;
		}
	}

	async startCursorPolling() {
		if (this.polling) return;
		this.polling = true;
		
		// Initial evaluation ASAP + force one more after first paint
		try {
			await new Promise(r => requestAnimationFrame(r));
			const { x, y } = await this.overlayAPI.getLocalCursor();
			this.updateMouseThroughAt(x, y);
		} catch {}

		// Fallback polling when window is ignoring mouse events
		while (this.polling) {
			try {
				const { x, y } = await this.overlayAPI.getLocalCursor();
				this.updateMouseThroughAt(x, y);
				await new Promise(r => setTimeout(r, 16)); // ~60fps
			} catch {
				await new Promise(r => setTimeout(r, 50));
			}
		}
	}

	stopCursorPolling() {
		this.polling = false;
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
		// Recebe sinal do main para voltar ao modo inteligente
		window.__overlaySmartMode = true;
		const smartModeSetter = setInterval(() => {
			if (window.__overlaySmartMode) {
				this.smartMode = true;
				window.__overlaySmartMode = false;
				this.shapeManager.updateWindowShape();
			}
		}, 200);

		// Store interval for cleanup
		this.smartModeInterval = smartModeSetter;
	}

	async forceShapeUpdate() {
		return await this.shapeManager.updateWindowShape();
	}

	getCurrentMousePosition() {
		return this.overlayAPI.getLocalCursor();
	}

	isLastPositionOpaque() {
		return this.lastOpaque;
	}

	destroy() {
		this.stopCursorPolling();
		if (this.smartModeInterval) {
			clearInterval(this.smartModeInterval);
		}
		
		// Remove event listeners
		document.removeEventListener('mousemove', this.onPointerMove);
		window.removeEventListener('resize', this.shapeManager.updateWindowShape);
	}
}

export default MouseInteractionUseCase; 