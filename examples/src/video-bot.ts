import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { PoeBot } from 'ts-poe/base';
import type { ServerSentEvent } from 'ts-poe/sse';
import { PartialResponse, type QueryRequest } from 'ts-poe/types';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class VideoBot extends PoeBot {
	protected async *getResponse(
		request: QueryRequest
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		const filePath = join(__dirname, '..', 'assets', 'tiger.mp4');
		const fileData = await readFile(filePath);
		await this.postMessageAttachment(request.messageId, request.accessKey, {
			fileData,
			filename: 'tiger.mp4'
		});
		yield {
			...PartialResponse.defaultValues(),
			text: 'Attached a video.'
		};
	}
}
