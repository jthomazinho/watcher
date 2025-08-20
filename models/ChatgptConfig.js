import mongoose, { Schema } from 'mongoose';

const EncryptedSchema = new Schema({
	algo: { type: String, required: true },
	iv: { type: String, required: true },
	tag: { type: String, required: true },
	ct: { type: String, required: true }
}, { _id: false });

const ChatgptConfigSchema = new Schema({
	_id: { type: String, default: 'chatgpt' },
	apiKeyEnc: { type: EncryptedSchema, default: null },
	model: { type: String, default: 'gpt-4o-mini' },
	updatedAt: { type: Date, default: Date.now }
}, { collection: 'configs' });

export const ChatgptConfig = mongoose.models.ChatgptConfig || mongoose.model('ChatgptConfig', ChatgptConfigSchema);

export default ChatgptConfig; 