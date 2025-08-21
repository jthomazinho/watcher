import { app } from 'electron';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

class CryptoUseCase {
	constructor() {
		this.secretKey = null;
	}

	getSecretKeyPath() {
		return path.join(app.getPath('userData'), 'secret.key');
	}

	getOrCreateSecretKey() {
		if (this.secretKey) return this.secretKey;

		const p = this.getSecretKeyPath();
		try {
			if (fs.existsSync(p)) {
				const raw = fs.readFileSync(p);
				if (raw && raw.length === 32) {
					this.secretKey = raw;
					return raw; // 32 bytes for AES-256
				}
			}
			const buf = crypto.randomBytes(32);
			fs.writeFileSync(p, buf);
			this.secretKey = buf;
			return buf;
		} catch {
			// Fallback ephemeral key (won't persist across runs)
			this.secretKey = crypto.randomBytes(32);
			return this.secretKey;
		}
	}

	encryptStringAesGcm(plainText) {
		const key = this.getOrCreateSecretKey();
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
		const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
		const tag = cipher.getAuthTag();
		return { 
			algo: 'aes-256-gcm', 
			iv: iv.toString('base64'), 
			ct: enc.toString('base64'), 
			tag: tag.toString('base64') 
		};
	}

	decryptStringAesGcm(encObj) {
		try {
			if (!encObj || encObj.algo !== 'aes-256-gcm') return '';
			const key = this.getOrCreateSecretKey();
			const iv = Buffer.from(String(encObj.iv || ''), 'base64');
			const ct = Buffer.from(String(encObj.ct || ''), 'base64');
			const tag = Buffer.from(String(encObj.tag || ''), 'base64');
			const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
			decipher.setAuthTag(tag);
			const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
			return dec.toString('utf8');
		} catch {
			return '';
		}
	}
}

export default CryptoUseCase; 