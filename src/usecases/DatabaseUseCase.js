import { MongoClient, ObjectId } from 'mongodb';
import { connectMongoose } from '../../models/mongoose.js';
import ChatgptConfig from '../../models/ChatgptConfig.js';

class DatabaseUseCase {
	constructor(cryptoUseCase) {
		this.mongoClient = null;
		this.mongoDb = null;
		this.cryptoUseCase = cryptoUseCase;
	}

	async getMongo() {
		if (this.mongoDb) return this.mongoDb;
		const uri = 'mongodb://127.0.0.1:27017';
		this.mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
		await this.mongoClient.connect();
		this.mongoDb = this.mongoClient.db('watcher');
		return this.mongoDb;
	}

	// Prompt Store methods
	async savePrompt({ prompt, effect, validated, comments }) {
		try {
			const db = await this.getMongo();
			const doc = {
				prompt: String(prompt || ''),
				effect: String(effect || ''),
				validated: Boolean(validated),
				comments: String(comments || ''),
				createdAt: new Date()
			};
			const res = await db.collection('prompts').insertOne(doc);
			return { ok: true, id: String(res.insertedId) };
		} catch (e) {
			return { ok: false, error: e?.message };
		}
	}

	async listPrompts({ q } = {}) {
		try {
			const db = await this.getMongo();
			let filter = {};
			if (q && String(q).trim()) {
				const regex = new RegExp(String(q).trim(), 'i');
				filter = { $or: [ { prompt: regex }, { effect: regex }, { comments: regex } ] };
			}
			const items = await db.collection('prompts').find(filter).sort({ createdAt: -1 }).limit(200).toArray();
			return items.map(x => ({ 
				id: String(x._id), 
				prompt: x.prompt, 
				effect: x.effect, 
				validated: !!x.validated, 
				comments: x.comments || '', 
				createdAt: x.createdAt 
			}));
		} catch (e) {
			return { ok: false, error: e?.message, items: [] };
		}
	}

	async updatePrompt({ id, validated, comments }) {
		try {
			if (!id) return { ok: false, error: 'id required' };
			const db = await this.getMongo();
			const _id = new ObjectId(String(id));
			await db.collection('prompts').updateOne(
				{ _id }, 
				{ $set: { 
					validated: validated != null ? Boolean(validated) : undefined, 
					comments: comments != null ? String(comments) : undefined 
				} }
			);
			return { ok: true };
		} catch (e) {
			return { ok: false, error: e?.message };
		}
	}

	// Links Repository methods
	async saveLink({ title, url: linkUrl, tags, notes, favorite }) {
		try {
			const db = await this.getMongo();
			const doc = {
				title: String(title || ''),
				url: String(linkUrl || ''),
				tags: Array.isArray(tags) ? tags.map(String) : String(tags || '').split(',').map(s => s.trim()).filter(Boolean),
				notes: String(notes || ''),
				favorite: Boolean(favorite),
				createdAt: new Date()
			};
			const res = await db.collection('links').insertOne(doc);
			return { ok: true, id: String(res.insertedId) };
		} catch (e) {
			return { ok: false, error: e?.message };
		}
	}

	async listLinks({ q } = {}) {
		try {
			const db = await this.getMongo();
			let filter = {};
			if (q && String(q).trim()) {
				const regex = new RegExp(String(q).trim(), 'i');
				filter = { $or: [ { title: regex }, { url: regex }, { tags: regex }, { notes: regex } ] };
			}
			const items = await db.collection('links').find(filter).sort({ favorite: -1, createdAt: -1 }).limit(200).toArray();
			return items.map(x => ({ 
				id: String(x._id), 
				title: x.title, 
				url: x.url, 
				tags: x.tags || [], 
				notes: x.notes || '', 
				favorite: !!x.favorite, 
				createdAt: x.createdAt 
			}));
		} catch (e) {
			return { ok: false, error: e?.message, items: [] };
		}
	}

	async updateLink({ id, title, url: linkUrl, tags, notes, favorite }) {
		try {
			if (!id) return { ok: false, error: 'id required' };
			const db = await this.getMongo();
			const _id = new ObjectId(String(id));
			const $set = {};
			if (title != null) $set.title = String(title);
			if (linkUrl != null) $set.url = String(linkUrl);
			if (tags != null) $set.tags = Array.isArray(tags) ? tags.map(String) : String(tags).split(',').map(s => s.trim()).filter(Boolean);
			if (notes != null) $set.notes = String(notes);
			if (favorite != null) $set.favorite = Boolean(favorite);
			await db.collection('links').updateOne({ _id }, { $set });
			return { ok: true };
		} catch (e) {
			return { ok: false, error: e?.message };
		}
	}

	// ChatGPT Config methods (with encryption)
	async getChatGptConfig() {
		try {
			await connectMongoose();
			const cfg = await ChatgptConfig.findById('chatgpt').lean();
			let apiKey = '';
			if (cfg?.apiKeyEnc) {
				apiKey = this.cryptoUseCase.decryptStringAesGcm(cfg.apiKeyEnc) || '';
			} else if (cfg?.apiKey) {
				// Backward-compat: legacy plaintext (will remain until user saves again)
				apiKey = String(cfg.apiKey || '');
			}
			console.log('[chatgpt:get-config] found=', !!cfg, 'model=', cfg?.model);
			return { apiKey, model: cfg?.model || 'gpt-4o-mini' };
		} catch (e) {
			console.error('[chatgpt:get-config] error:', e?.message || e);
			return { apiKey: '', model: 'gpt-4o-mini', error: e?.message };
		}
	}

	async saveChatGptConfig({ apiKey, model }) {
		try {
			await connectMongoose();
			const trimmed = String(apiKey || '').trim();
			const set = { model: String(model || 'gpt-4o-mini'), updatedAt: new Date() };
			if (trimmed) set.apiKeyEnc = this.cryptoUseCase.encryptStringAesGcm(trimmed);
			const res = await ChatgptConfig.updateOne(
				{ _id: 'chatgpt' }, 
				{ $set: set, $unset: { apiKey: '' } }, 
				{ upsert: true }
			);
			console.log('[chatgpt:save-config] ok res=', res);
			return { ok: true };
		} catch (e) {
			console.error('[chatgpt:save-config] error:', e?.message || e);
			return { ok: false, error: e?.message };
		}
	}
}

export default DatabaseUseCase; 