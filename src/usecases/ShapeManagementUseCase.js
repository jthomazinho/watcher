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
		// Regra: componentes são 0.5 ou 0.0. Só consideramos opaco se >= 0.5
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
		// Fast path: any interactive box region counts as opaque regardless de alpha visual
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

export default ShapeManagementUseCase; 