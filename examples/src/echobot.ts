import { PoeBot } from 'ts-poe/base';
import { PartialResponse, type QueryRequest } from 'ts-poe/types';
import type { ServerSentEvent } from 'ts-poe/sse';

/**
 * Sample bot that echoes back messages.
 *
 * This is the simplest possible bot and a great place to start if you want to build your own bot.
 */
export class EchoBot extends PoeBot {
	protected async *getResponse(
		request: QueryRequest
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		const lastMessage = request.query[request.query.length - 1].content;
		yield {
			...PartialResponse.defaultValues(),
			text: lastMessage
		};
	}
}
