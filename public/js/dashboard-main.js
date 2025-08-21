// Dashboard Main JavaScript

class DashboardApplication {
	constructor() {
		this.contents = null;
		this.initialized = false;
	}

	initialize() {
		if (this.initialized) return;
		
		this.contents = document.querySelectorAll('[data-content]');
		this.setupSectionController();
		this.setupSettings();
		this.setupChatGPT();
		this.setupQualAudio();
		this.setupPromptStore();
		this.setupLinksRepo();
		
		this.initialized = true;
		console.log('Dashboard application initialized');
	}

	// Section controller for main content
	setupSectionController() {
		window.showSection = (name) => {
			this.contents.forEach(c => c.style.display = c.getAttribute('data-content') === name ? 'block' : 'none');
			if (name === 'lib') { 
				try { this.renderPromptList(); } catch {} 
			}
		};
		// Default: don't show anything until user chooses
		window.showSection('');
	}

	// Settings functionality
	setupSettings() {
		this.setupPanelOpacity();
		this.setupAlwaysOnTop();
		this.setupSettingsTabs();
		this.setupDisplaySettings();
	}

	setupPanelOpacity() {
		const panelOpacity = document.getElementById('panelOpacity');
		if (panelOpacity) {
			panelOpacity.addEventListener('input', (e) => {
				const v = Number(e.target.value) / 100;
				document.querySelectorAll('.panel').forEach(p => p.style.background = `rgba(30,30,30,${v})`);
			});
		}
	}

	setupAlwaysOnTop() {
		const cfgOnTop = document.getElementById('cfgOnTop');
		if (cfgOnTop) {
			cfgOnTop.addEventListener('change', (e) => {
				const v = e.target.value === 'true';
				window.parent?.overlay?.setAlwaysOnTop(v);
			});
		}
	}

	getChatApi() {
		try {
			if (window.bridge && window.bridge.chatgpt) return window.bridge.chatgpt;
			const p = window.parent;
			if (!p) return null;
			if (p.overlay && typeof p.overlay.getChatgptConfig === 'function' && typeof p.overlay.saveChatgptConfig === 'function') {
				return {
					getConfig: () => p.overlay.getChatgptConfig(),
					saveConfig: ({ apiKey, model }) => p.overlay.saveChatgptConfig({ apiKey, model })
				};
			}
			if (p.overlay && p.overlay.chatgpt) return p.overlay.chatgpt;
			if (p.chatgpt) return p.chatgpt;
			return null;
		} catch {
			return null;
		}
	}

	async waitForChatApi(maxMs = 2000) {
		const start = Date.now();
		let api = this.getChatApi();
		while (!api && (Date.now() - start) < maxMs) {
			await new Promise(r => setTimeout(r, 100));
			api = this.getChatApi();
		}
		return api;
	}

	setupSettingsTabs() {
		const tabsRoot = document.getElementById('settingsTabs');
		if (!tabsRoot) return;
		
		const tabs = tabsRoot.querySelectorAll('.tab');
		const general = document.getElementById('settingsGeneral');
		const chat = document.getElementById('settingsChatgpt');
		
		tabs.forEach(tab => tab.addEventListener('click', async () => {
			tabs.forEach(t => t.classList.remove('active'));
			tab.classList.add('active');
			const name = tab.getAttribute('data-tab');
			
			if (name === 'chatgpt') {
				general.style.display = 'none';
				chat.style.display = 'block';
				await this.loadChatGPTConfig();
			} else {
				general.style.display = 'block';
				chat.style.display = 'none';
			}
		}));
		
		// Preselect General
		general.style.display = 'block';
		chat.style.display = 'none';
		
		// Setup save button
		this.setupChatGPTSave();
	}

	async loadChatGPTConfig() {
		try {
			const api = await this.waitForChatApi();
			if (!api) throw new Error('Bridge indisponível');
			const cfg = await api.getConfig();
			document.getElementById('cfgChatApiKey').value = cfg?.apiKey || '';
			document.getElementById('cfgChatModel').value = cfg?.model || 'gpt-4o-mini';
			document.getElementById('cfgChatError').style.display = 'none';
			if (cfg?.error) {
				const el = document.getElementById('cfgChatError');
				el.textContent = 'Erro ao carregar configuração: ' + cfg.error;
				el.style.display = 'block';
			}
		} catch (e) {
			const el = document.getElementById('cfgChatError');
			el.textContent = 'Erro ao carregar configuração: ' + (e?.message || String(e));
			el.style.display = 'block';
		}
	}

	setupChatGPTSave() {
		const saveBtn = document.getElementById('cfgChatSave');
		if (!saveBtn) return;
		
		saveBtn.addEventListener('click', async () => {
			const api = await this.waitForChatApi();
			if (!api) {
				const el = document.getElementById('cfgChatError');
				el.textContent = 'Bridge indisponível. Recarregue o app.';
				el.style.display = 'block';
				return;
			}
			const apiKey = document.getElementById('cfgChatApiKey').value.trim();
			const model = document.getElementById('cfgChatModel').value;
			const msg = document.getElementById('cfgChatSavedMsg');
			const err = document.getElementById('cfgChatError');
			msg.style.display = 'none';
			err.style.display = 'none';
			try {
				const res = await api.saveConfig({ apiKey, model });
				if (!res || res.ok !== true) {
					throw new Error(res?.error || 'Falha ao salvar');
				}
				msg.style.display = 'block';
				setTimeout(() => { msg.style.display = 'none'; }, 1500);
			} catch (e) {
				err.textContent = 'Erro ao salvar: ' + (e?.message || String(e));
				err.style.display = 'block';
			}
		});
	}

	async setupDisplaySettings() {
		try {
			const select = document.getElementById('cfgDisplay');
			const displays = await window.parent.overlay.getDisplays();
			const cfg = await window.parent.overlay.getConfig();
			select.innerHTML = displays.map(d => `<option value="${d.index}" ${cfg.displayIndex===d.index || (cfg.displayIndex==null && d.isPrimary)?'selected':''}>${d.label}</option>`).join('');
				
			// Init content protection selector
			const contentProt = document.getElementById('cfgContentProt');
			contentProt.value = String(Boolean(cfg.contentProtection));
			contentProt.addEventListener('change', async () => {
				await window.parent.overlay.setContentProtection(contentProt.value === 'true');
			});
		
			document.getElementById('btnApplyDisplay').addEventListener('click', async () => {
				const idx = Number(select.value);
				await window.parent.overlay.applyDisplay(idx);
			});
		} catch (e) {
			console.warn('Displays error', e);
		}
	}

	// ChatGPT functionality
	setupChatGPT() {
		const btnAsk = document.getElementById('btnAsk');
		if (!btnAsk) return;
		
		btnAsk.addEventListener('click', async () => {
			await this.askChatGPT();
		});
	}

	async askChatGPT() {
		const api = await this.waitForChatApi();
		const out = document.getElementById('gptAnswer');
		if (!api) { 
			out.textContent = 'Bridge indisponível. Recarregue o app.'; 
			return; 
		}
		const cfg = await api.getConfig();
		const key = (cfg?.apiKey || '').trim();
		const model = (cfg?.model || 'gpt-4o-mini');
		const prompt = document.getElementById('gptPrompt').value.trim();
		if (!key) { 
			out.textContent = 'Configure a API Key em Configurações > ChatGPT.'; 
			return; 
		}
		if (!prompt) { 
			out.textContent = 'Digite sua pergunta.'; 
			return; 
		}
		out.textContent = 'Consultando...';
		try {
			const res = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${key}`
				},
				body: JSON.stringify({
					model: model,
					messages: [ { role: 'user', content: prompt } ]
				})
			});
			if (!res.ok) {
				const txt = await res.text().catch(()=> '');
				throw new Error('HTTP ' + res.status + ' ' + res.statusText + (txt ? ' - ' + txt : ''));
			}
			const data = await res.json();
			out.textContent = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
		} catch (e) {
			out.textContent = 'Erro: ' + (e?.message || String(e));
		}
	}

	// Qual Audio Monitor functionality
	setupQualAudio() {
		const startBtn = document.getElementById('qualStart');
		const stopBtn = document.getElementById('qualStop');
		
		if (startBtn) {
			startBtn.addEventListener('click', async () => {
				const apiKey = document.getElementById('qualApiKey').value.trim();
				const seg = Number(document.getElementById('qualSeg').value) || 15;
				await window.parent.overlay.audio.start({ apiKey, segmentSeconds: seg });
			});
		}
		
		if (stopBtn) {
			stopBtn.addEventListener('click', async () => {
				await window.parent.overlay.audio.stop();
			});
		}
		
		// Setup audio event listeners
		if (window.parent.overlay && window.parent.overlay.audio) {
			window.parent.overlay.audio.onTranscript(({ text }) => {
				const el = document.getElementById('qualTranscript');
				if (!el) return;
				el.textContent += (el.textContent ? '\n' : '') + text;
				el.scrollTop = el.scrollHeight;
			});
			
			window.parent.overlay.audio.onSummary(({ summary }) => {
				const el = document.getElementById('qualSummary');
				if (!el) return;
				el.textContent = summary || '';
			});
		}
	}

	// Prompt Store functionality
	setupPromptStore() {
		const saveBtn = document.getElementById('psSave');
		const searchBtn = document.getElementById('psSearchBtn');
		const searchInput = document.getElementById('psSearch');
		
		if (saveBtn) {
			saveBtn.addEventListener('click', async () => {
				await this.savePrompt();
			});
		}
		
		if (searchBtn) {
			searchBtn.addEventListener('click', () => this.renderPromptList());
		}
		
		if (searchInput) {
			searchInput.addEventListener('keydown', (e) => { 
				if (e.key === 'Enter') this.renderPromptList(); 
			});
		}
	}

	async savePrompt() {
		const prompt = document.getElementById('psPrompt').value;
		const effect = document.getElementById('psEffect').value;
		const validated = document.getElementById('psValidated').checked;
		const comments = document.getElementById('psComments').value;
		await window.parent.overlay.promptStore.save({ prompt, effect, validated, comments });
		document.getElementById('psPrompt').value = '';
		document.getElementById('psEffect').value = '';
		document.getElementById('psValidated').checked = false;
		document.getElementById('psComments').value = '';
		this.renderPromptList();
	}

	async renderPromptList() {
		try {
			const q = (document.getElementById('psSearch')?.value || '').trim();
			const list = await window.parent.overlay.promptStore.list({ q });
			const items = Array.isArray(list) ? list : (list.items || []);
			const root = document.getElementById('psList');
			if (!root) return;
			root.innerHTML = '';
			for (const it of items) {
				const row = document.createElement('div');
				row.style.display = 'grid';
				row.style.gridTemplateColumns = '1fr 1fr auto auto';
				row.style.gap = '8px';
				row.innerHTML = `
					<div style="opacity:.9; white-space:pre-wrap;">${(it.prompt||'').slice(0,240)}</div>
					<div style="opacity:.8; white-space:pre-wrap;">${(it.effect||'').slice(0,240)}</div>
					<label style="display:flex; align-items:center; gap:6px;"><input type="checkbox" ${it.validated?'checked':''}/> Validado</label>
					<input type="text" value="${it.comments||''}" placeholder="Comentários"/>
				`;
				const [_, __, chk, inp] = row.children;
				chk.addEventListener('change', async () => {
					await window.parent.overlay.promptStore.update({ id: it.id, validated: chk.querySelector('input').checked });
				});
				inp.addEventListener('change', async () => {
					await window.parent.overlay.promptStore.update({ id: it.id, comments: inp.value });
				});
				root.appendChild(row);
			}
		} catch (e) {}
	}

	// Links Repository functionality
	setupLinksRepo() {
		const saveBtn = document.getElementById('lrSave');
		const searchBtn = document.getElementById('lrSearchBtn');
		const searchInput = document.getElementById('lrSearch');
		
		if (saveBtn) {
			saveBtn.addEventListener('click', async () => {
				await this.saveLink();
			});
		}
		
		if (searchBtn) {
			searchBtn.addEventListener('click', () => this.renderLinks());
		}
		
		if (searchInput) {
			searchInput.addEventListener('keydown', (e) => { 
				if (e.key === 'Enter') this.renderLinks(); 
			});
		}
	}

	async saveLink() {
		const title = document.getElementById('lrTitle').value;
		const url = document.getElementById('lrUrl').value;
		const tags = document.getElementById('lrTags').value;
		const notes = document.getElementById('lrNotes').value;
		const favorite = document.getElementById('lrFav').checked;
		await window.parent.overlay.linkRepo.save({ title, url, tags, notes, favorite });
		document.getElementById('lrTitle').value = '';
		document.getElementById('lrUrl').value = '';
		document.getElementById('lrTags').value = '';
		document.getElementById('lrNotes').value = '';
		document.getElementById('lrFav').checked = false;
		this.renderLinks();
	}

	async renderLinks() {
		try {
			const q = (document.getElementById('lrSearch')?.value || '').trim();
			const list = await window.parent.overlay.linkRepo.list({ q });
			const items = Array.isArray(list) ? list : (list.items || []);
			const root = document.getElementById('lrList');
			if (!root) return;
			root.innerHTML = '';
			for (const it of items) {
				const row = document.createElement('div');
				row.style.display = 'grid';
				row.style.gridTemplateColumns = '2fr 3fr 1fr auto';
				row.style.gap = '8px';
				row.innerHTML = `
					<div style="opacity:.95;">${it.title || ''}</div>
					<a href="${it.url}" target="_blank" style="color:#9cf; word-break:break-all;">${it.url}</a>
					<div style="opacity:.8;">${(it.tags||[]).join(', ')}</div>
					<label style="display:flex; align-items:center; gap:6px;"><input type="checkbox" ${it.favorite?'checked':''}/> Favorito</label>
				`;
				const fav = row.querySelector('input[type="checkbox"]');
				fav.addEventListener('change', async () => {
					await window.parent.overlay.linkRepo.update({ id: it.id, favorite: fav.checked });
				});
				root.appendChild(row);
			}
		} catch (e) {}
	}
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
	const dashboardApp = new DashboardApplication();
	dashboardApp.initialize();
	
	// Expose globally for compatibility
	window.dashboardApp = dashboardApp;
	window.renderPromptList = () => dashboardApp.renderPromptList();
	window.renderLinks = () => dashboardApp.renderLinks();
});

// Also handle the case where DOM is already loaded
if (document.readyState === 'loading') {
	// DOM hasn't loaded yet
} else {
	// DOM has already loaded
	setTimeout(() => {
		if (!window.dashboardApp) {
			const dashboardApp = new DashboardApplication();
			dashboardApp.initialize();
			window.dashboardApp = dashboardApp;
			window.renderPromptList = () => dashboardApp.renderPromptList();
			window.renderLinks = () => dashboardApp.renderLinks();
		}
	}, 0);
} 