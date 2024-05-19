import axios, { type AxiosResponse, type AxiosRequestConfig } from 'axios';

export interface ServerSentEvent {
	data?: string;
	event?: string;
	id?: string;
	retry?: number;
}

const LINE_SEP_EXPR: RegExp = /\r\n|\r|\n/;

export function encodeServerSentEvent(
	sse: ServerSentEvent,
	comment: string = '',
	sep: string = '\r\n'
): Buffer {
	let output = '';
	if (comment) {
		comment.split(LINE_SEP_EXPR).forEach((chunk) => {
			output += `: ${chunk}${sep}`;
		});
	}
	if (sse.id !== undefined) {
		output += `id: ${sse.id.replace(LINE_SEP_EXPR, '')}${sep}`;
	}
	if (sse.event !== undefined) {
		output += `event: ${sse.event.replace(LINE_SEP_EXPR, '')}${sep}`;
	}

	if (sse.data !== undefined) {
		sse.data.split(LINE_SEP_EXPR).forEach((chunk) => {
			output += `data: ${chunk}${sep}`;
		});
	}

	if (sse.retry !== undefined) {
		if (typeof sse.retry !== 'number') {
			throw new TypeError('retry argument must be number');
		}
		output += `retry: ${sse.retry}${sep}`;
	}

	output += sep;
	return Buffer.from(output);
}

export class SSEDecoder {
	private event: string = '';
	private data: string[] = [];
	private lastEventId: string = '';
	private retry: number | null = null;

	decode(line: string): ServerSentEvent | null {
		// See: https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation

		if (!line) {
			if (!this.event && this.data.length === 0 && !this.lastEventId && this.retry === null) {
				return null;
			}

			const sse: ServerSentEvent = {
				event: this.event ?? 'message',
				data: this.data.join('\n'),
				id: this.lastEventId,
				retry: this.retry!
			};

			// NOTE: as per the SSE spec, do not reset lastEventId.
			this.event = '';
			this.data = [];
			this.retry = null;

			return sse;
		}

		if (line.startsWith(':')) {
			return null;
		}

		const [fieldname, value] = this.extractFieldAndValue(line);

		switch (fieldname) {
			case 'event':
				this.event = value;
				break;
			case 'data':
				this.data.push(value);
				break;
			case 'id':
				if (!value.includes('\0')) {
					this.lastEventId = value;
				}
				break;
			case 'retry': {
				const retryValue = parseInt(value);
				if (!isNaN(retryValue)) {
					this.retry = retryValue;
				}
				break;
			}
			default:
				// Field is ignored.
				break;
		}

		return null;
	}

	private extractFieldAndValue(line: string): [string, string] {
		const index = line.indexOf(':');
		if (index === -1) {
			return [line, ''];
		}
		const fieldname = line.substring(0, index);
		let value = line.substring(index + 1);
		if (value.startsWith(' ')) {
			value = value.substring(1);
		}
		return [fieldname, value];
	}
}

export class EventSource {
	private response: AxiosResponse;

	constructor(response: AxiosResponse) {
		this.response = response;
	}

	private checkContentType(): void {
		const contentType = this.response.headers['content-type']?.split(';')[0] ?? '';
		if (!contentType.includes('text/event-stream')) {
			throw new Error(
				`Expected response header Content-Type to contain 'text/event-stream', got '${contentType}'`
			);
		}
	}

	public async *iterSSE(): AsyncIterable<ServerSentEvent> {
		this.checkContentType();
		const decoder = new SSEDecoder();

		if (this.response.data) {
			let buffer = '';
			const td = new TextDecoder();
			for await (const chunk of this.response.data) {
				buffer += td.decode(chunk, { stream: true });
				let firstNewline;
				while ((firstNewline = buffer.indexOf('\n')) !== -1) {
					const chunkLine = buffer.substring(0, firstNewline);
					buffer = buffer.substring(firstNewline + 1);
					const sse = decoder.decode(chunkLine.toString().trim());
					if (sse) {
						yield sse;
					}
				}
			}
		}
	}
}

export async function connectSSE(
	url: string,
	method: string = 'GET',
	config: AxiosRequestConfig = {}
): Promise<EventSource> {
	const headers = config.headers || {};
	headers['Accept'] = 'text/event-stream';
	headers['Cache-Control'] = 'no-store';

	const response = await axios.request({
		...config,
		method: method,
		url: url,
		headers: headers,
		responseType: 'stream'
	});

	return new EventSource(response);
}
