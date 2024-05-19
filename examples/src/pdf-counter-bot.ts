import axios from 'axios';
import { PDFDocument } from 'pdf-lib';
import { PoeBot } from 'ts-poe/base';
import type { ServerSentEvent } from 'ts-poe/sse';
import { PartialResponse, SettingsResponse, type QueryRequest } from 'ts-poe/types';

class FileDownloadError extends Error {
	constructor() {
		super('Failed to download file');
	}
}

async function fetchPdfAndCountNumPages(url: string): Promise<number> {
	try {
		const response = await axios.get(url, { responseType: 'arraybuffer' });
		if (response.status !== 200) {
			throw new FileDownloadError();
		}
		const pdfDoc = await PDFDocument.load(response.data);
		return pdfDoc.getPages().length;
	} catch (error) {
		throw new FileDownloadError();
	}
}

/**
 * Sample bot that echoes back messages.
 *
 * This is the simplest possible bot and a great place to start if you want to build your own bot.
 */
export class PDFSizeBot extends PoeBot {
	protected async *getResponse(
		request: QueryRequest
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		for (const message of request.query.reverse()) {
			for (const attachment of message.attachments) {
				if (attachment.contentType === 'application/pdf') {
					try {
						const numPages = await fetchPdfAndCountNumPages(attachment.url);
						yield {
							...PartialResponse.defaultValues(),
							text: `${attachment.name} has ${numPages} pages`
						};
					} catch (error) {
						yield {
							...PartialResponse.defaultValues(),
							text: 'Failed to retrieve the document.'
						};
					}
					return;
				}
			}
		}
	}
	protected async getSettings(): Promise<SettingsResponse> {
		return { ...SettingsResponse.defaultValues(), allowAttachments: true };
	}
}
