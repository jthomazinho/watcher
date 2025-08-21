import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, spawnSync } from 'child_process';

class AudioMonitorUseCase {
	constructor() {
		this.audioMon = {
			proc: null,
			segmentsDir: '',
			openaiKey: '',
			segmentSeconds: 15,
			running: false,
			transcript: '',
			summary: ''
		};
		this.segmentsWatcher = null;
		this.mainWindow = null;
	}

	setMainWindow(mainWindow) {
		this.mainWindow = mainWindow;
	}

	getSegmentsDir() {
		const dir = path.join(app.getPath('userData'), 'audio_segments');
		try { fs.mkdirSync(dir, { recursive: true }); } catch {}
		return dir;
	}

	detectFfmpeg() {
		try {
			const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' });
			return r.status === 0;
		} catch { return false; }
	}

	detectPulseMonitor() {
		try {
			const r = spawnSync('pactl', ['info'], { encoding: 'utf-8' });
			if (r.status === 0 && r.stdout) {
				const m = r.stdout.split('\n').find(l => l.toLowerCase().startsWith('default sink:'));
				if (m) {
					const sink = m.split(':').slice(1).join(':').trim();
					if (sink) return `${sink}.monitor`;
				}
			}
		} catch {}
		return 'default';
	}

	async transcribeFile(filePath) {
		try {
			const stat = fs.statSync(filePath);
			if (!stat || stat.size < 1024) return null;
			const form = new FormData();
			form.append('model', 'whisper-1');
			form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
			const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
				method: 'POST',
				headers: { Authorization: `Bearer ${this.audioMon.openaiKey}` },
				body: form
			});
			if (!res.ok) return null;
			const data = await res.json();
			return data.text || '';
		} catch {
			return null;
		}
	}

	async updateSummary() {
		try {
			if (!this.audioMon.transcript.trim()) return;
			const res = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.audioMon.openaiKey}` },
				body: JSON.stringify({
					model: 'gpt-4o-mini',
					messages: [
						{ role: 'system', content: 'Você é um assistente que resume áudio transcrito de forma breve e objetiva em português.' },
						{ role: 'user', content: `Transcrição acumulada (faça um resumo curto, objetivo e atualizado):\n\n${this.audioMon.transcript.slice(-8000)}` }
					]
				})
			});
			if (!res.ok) return;
			const data = await res.json();
			this.audioMon.summary = data.choices?.[0]?.message?.content || this.audioMon.summary;
			try { this.mainWindow?.webContents.send('audio:summary-update', { summary: this.audioMon.summary }); } catch {}
		} catch {}
	}

	watchSegments(dir) {
		try {
			const watcher = fs.watch(dir, async (event, filename) => {
				if (event !== 'rename' || !filename) return;
				const filePath = path.join(dir, filename);
				setTimeout(async () => {
					if (!fs.existsSync(filePath)) return;
					const text = await this.transcribeFile(filePath);
					if (text && text.trim()) {
						this.audioMon.transcript += (this.audioMon.transcript ? '\n' : '') + text.trim();
						try { this.mainWindow?.webContents.send('audio:transcript-chunk', { text }); } catch {}
						this.updateSummary();
					}
					try { fs.unlinkSync(filePath); } catch {}
				}, 300);
			});
			return watcher;
		} catch {
			return null;
		}
	}

	startAudioMonitor({ openaiKey, segmentSeconds = 15 } = {}) {
		if (this.audioMon.running) return { ok: true };
		if (!this.detectFfmpeg()) {
			try { this.mainWindow?.webContents.send('audio:error', { message: 'ffmpeg não encontrado no PATH.' }); } catch {}
			return { ok: false, error: 'ffmpeg não encontrado.' };
		}
		this.audioMon.openaiKey = String(openaiKey || '').trim();
		if (!this.audioMon.openaiKey) return { ok: false, error: 'OpenAI API key é obrigatório.' };
		this.audioMon.segmentSeconds = Math.max(5, Number(segmentSeconds) || 15);
		this.audioMon.transcript = '';
		this.audioMon.summary = '';
		const dir = this.getSegmentsDir();
		this.audioMon.segmentsDir = dir;
		const inputName = this.detectPulseMonitor();
		const pattern = path.join(dir, 'seg-%03d.wav');
		const args = [
			'-y',
			'-f', 'pulse',
			'-i', inputName,
			'-ac', '1',
			'-ar', '16000',
			'-f', 'segment',
			'-segment_time', String(this.audioMon.segmentSeconds),
			'-reset_timestamps', '1',
			pattern
		];
		try {
			this.audioMon.proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
			this.audioMon.proc.stderr?.on('data', (d) => {
				const msg = String(d || '').trim();
				if (msg) try { this.mainWindow?.webContents.send('audio:log', { msg }); } catch {}
			});
			this.audioMon.proc.on('error', (e) => {
				try { this.mainWindow?.webContents.send('audio:error', { message: e?.message || 'erro no ffmpeg' }); } catch {}
			});
			this.audioMon.proc.on('exit', (code) => {
				this.audioMon.running = false;
				try { this.mainWindow?.webContents.send('audio:log', { msg: `ffmpeg saiu com código ${code}` }); } catch {}
			});
			this.audioMon.running = true;
			this.segmentsWatcher = this.watchSegments(dir);
			return { ok: true, input: inputName };
		} catch (e) {
			this.audioMon.running = false;
			return { ok: false, error: e?.message };
		}
	}

	stopAudioMonitor() {
		try { this.segmentsWatcher?.close(); } catch {}
		this.segmentsWatcher = null;
		if (this.audioMon.proc && !this.audioMon.proc.killed) {
			try { this.audioMon.proc.kill('SIGTERM'); } catch {}
		}
		this.audioMon.proc = null;
		this.audioMon.running = false;
		return { ok: true };
	}

	getStatus() {
		return { 
			running: this.audioMon.running, 
			transcript: this.audioMon.transcript, 
			summary: this.audioMon.summary 
		};
	}
}

export default AudioMonitorUseCase; 