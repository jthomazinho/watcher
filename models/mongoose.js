import mongoose from 'mongoose';

let isConnecting = null;

export async function connectMongoose() {
	if (mongoose.connection.readyState === 1) return mongoose.connection;
	if (isConnecting) return isConnecting;
	const uri = 'mongodb://127.0.0.1:27017/watcher';
	isConnecting = mongoose.connect(uri, {
		serverSelectionTimeoutMS: 1000,
		autoIndex: false
	}).then(() => mongoose.connection).finally(() => { isConnecting = null; });
	return isConnecting;
}

export default mongoose; 