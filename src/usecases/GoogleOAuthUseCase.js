import { google } from 'googleapis';
import { shell } from 'electron';
import http from 'http';
import crypto from 'crypto';

class GoogleOAuthUseCase {
	constructor() {
		this.googleOAuthClient = null;
		this.googleTokens = null;
		this.pendingPkce = null; // { codeVerifier, redirectUri, clientId, clientSecret }
	}

	// --- Helpers for Google OAuth PKCE ---
	toBase64Url(buffer) {
		return buffer.toString('base64')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/g, '');
	}

	createPkcePair() {
		const codeVerifier = this.toBase64Url(crypto.randomBytes(32));
		const challenge = this.toBase64Url(crypto.createHash('sha256').update(codeVerifier).digest());
		return { codeVerifier, codeChallenge: challenge };
	}

	createOAuthClient({ clientId, clientSecret, redirectUri }) {
		if (!clientId) throw new Error('Google Client ID é obrigatório.');
		return new google.auth.OAuth2({ clientId, clientSecret: clientSecret || undefined, redirectUri });
	}

	// Manual (copy/paste) flow — keeps PKCE in memory between begin and finish
	async beginAuth({ clientId, clientSecret }) {
		const { codeVerifier, codeChallenge } = this.createPkcePair();
		const redirectUri = 'http://127.0.0.1:53682/callback';
		const oauth2 = this.createOAuthClient({ clientId, clientSecret, redirectUri });
		const scopes = [
			'https://www.googleapis.com/auth/calendar.readonly',
			'openid', 'email', 'profile'
		];
		const authUrl = oauth2.generateAuthUrl({
			access_type: 'offline',
			scope: scopes,
			code_challenge_method: 'S256',
			code_challenge: codeChallenge
		});
		this.pendingPkce = { codeVerifier, redirectUri, clientId, clientSecret };
		return { authUrl };
	}

	async finishAuth({ clientId, clientSecret, authCode }) {
		if (!this.pendingPkce || this.pendingPkce.clientId !== clientId) throw new Error('Fluxo de login não iniciado ou expirado.');
		const oauth2 = this.createOAuthClient({ clientId, clientSecret, redirectUri: this.pendingPkce.redirectUri });
		const { tokens } = await oauth2.getToken({ code: authCode, codeVerifier: this.pendingPkce.codeVerifier });
		oauth2.setCredentials(tokens);
		this.googleTokens = tokens;
		this.googleOAuthClient = oauth2;
		this.pendingPkce = null;
		return { ok: true };
	}

	// Automatic loopback server flow
	async authAuto({ clientId, clientSecret }) {
		const server = http.createServer();
		const listenPort = await new Promise((resolve, reject) => {
			server.listen(0, '127.0.0.1', () => {
				const addr = server.address();
				if (addr && typeof addr === 'object') resolve(addr.port);
				else reject(new Error('Falha ao abrir porta local.'));
			});
		});
		const redirectUri = `http://127.0.0.1:${listenPort}/callback`;
		const { codeVerifier, codeChallenge } = this.createPkcePair();
		const oauth2 = this.createOAuthClient({ clientId, clientSecret, redirectUri });
		const scopes = [
			'https://www.googleapis.com/auth/calendar.readonly',
			'openid', 'email', 'profile'
		];
		const authUrl = oauth2.generateAuthUrl({
			access_type: 'offline',
			scope: scopes,
			code_challenge_method: 'S256',
			code_challenge: codeChallenge
		});

		// Wait for callback
		const code = await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				server.close();
				reject(new Error('Tempo esgotado aguardando autorização.'));
			}, 120000);
			server.on('request', (req, res) => {
				try {
					const parsed = new URL(req.url || '/', `http://127.0.0.1:${listenPort}`);
					if (parsed.pathname === '/callback') {
						const authCode = parsed.searchParams.get('code');
						res.statusCode = 200;
						res.setHeader('Content-Type', 'text/html; charset=utf-8');
						res.end('<html><body><h3>Login concluído. Você pode fechar esta janela.</h3></body></html>');
						clearTimeout(timeout);
						server.close();
						if (authCode) resolve(authCode); else reject(new Error('Código não recebido.'));
						return;
					}
					res.statusCode = 404; res.end();
				} catch (e) {
					res.statusCode = 500; res.end('Erro.');
				}
			});
		});

		const { tokens } = await oauth2.getToken({ code, codeVerifier });
		oauth2.setCredentials(tokens);
		this.googleTokens = tokens;
		this.googleOAuthClient = oauth2;

		// Open user's browser after starting server
		shell.openExternal(authUrl);

		return { ok: true };
	}

	async listEvents({ clientId, clientSecret, calendarId = 'primary' }) {
		if (!this.googleOAuthClient) {
			if (!this.googleTokens) throw new Error('Não autenticado.');
			// Recreate client if needed
			this.googleOAuthClient = this.createOAuthClient({ clientId, clientSecret, redirectUri: 'http://127.0.0.1' });
			this.googleOAuthClient.setCredentials(this.googleTokens);
		}
		const calendar = google.calendar({ version: 'v3', auth: this.googleOAuthClient });
		const now = new Date();
		const res = await calendar.events.list({
			calendarId,
			timeMin: now.toISOString(),
			maxResults: 10,
			singleEvents: true,
			orderBy: 'startTime'
		});
		return res.data.items || [];
	}
}

export default GoogleOAuthUseCase; 