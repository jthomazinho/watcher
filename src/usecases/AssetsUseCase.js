import { app } from 'electron';
import path from 'path';
import url from 'url';

class AssetsUseCase {
	getFileUrl(relPath) {
		try {
			const p = path.join(app.getAppPath(), String(relPath || ''));
			return url.pathToFileURL(p).toString();
		} catch (e) {
			return '';
		}
	}

	getFilePath(relPath) {
		try {
			const p = path.join(app.getAppPath(), String(relPath || ''));
			return p;
		} catch (e) {
			return '';
		}
	}
}

export default AssetsUseCase; 