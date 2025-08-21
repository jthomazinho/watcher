import { app } from 'electron';
import path from 'path';
import fs from 'fs';

class ConfigUseCase {
	constructor() {
		this.DEFAULT_CFG = { displayIndex: null, fullscreen: true, contentProtection: false };
	}

	getConfigPath() {
		return path.join(app.getPath('userData'), 'overlay.config.json');
	}

	loadConfig() {
		try {
			const raw = fs.readFileSync(this.getConfigPath(), 'utf-8');
			const parsed = JSON.parse(raw);
			return { ...this.DEFAULT_CFG, ...parsed };
		} catch {
			return { ...this.DEFAULT_CFG };
		}
	}

	saveConfig(cfg) {
		try {
			fs.mkdirSync(app.getPath('userData'), { recursive: true });
			fs.writeFileSync(this.getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8');
		} catch {}
	}

	updateConfig(updates) {
		const currentConfig = this.loadConfig();
		const newConfig = { ...currentConfig, ...updates };
		this.saveConfig(newConfig);
		return newConfig;
	}
}

export default ConfigUseCase; 