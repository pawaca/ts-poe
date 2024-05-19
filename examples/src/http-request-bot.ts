import type { Request } from 'express';
import { PoeBot } from 'ts-poe/base';
import type { ServerSentEvent } from 'ts-poe/sse';
import { PartialResponse, type QueryRequest, type RequestContext } from 'ts-poe/types';

/**
 * Sample bot that shows how to access the HTTP request.
 */
export class HttpRequestBot extends PoeBot {
	protected async *getResponseWithContext(
		request: QueryRequest,
		context: RequestContext
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		const httpReq = context.httpRequest as Request;
		yield {
			...PartialResponse.defaultValues(),
			text: `The request url is: ${httpReq.url}, query params are: ${JSON.stringify(httpReq.query)}`
		};
	}
}
