import { HfInference } from '@huggingface/inference';
import 'dotenv/config';
import { PoeBot } from 'ts-poe/base';
import type { ServerSentEvent } from 'ts-poe/sse';
import { PartialResponse, type QueryRequest } from 'ts-poe/types';

/**
 * This bot uses the HuggingFace Inference API.
 *
 * By default, it uses the HuggingFace public Inference API, but you can also
 * use this class with a self hosted Inference Endpoint.
 * For more information on how to create a self hosted endpoint, see:
 * https://huggingface.co/blog/inference-endpoints
 *
 * Arguments:
 *   - model: either the name of the model (if you want to use the public API)
 *   or a link to your hosted inference endpoint.
 */
export class HuggingFaceConversationalBot extends PoeBot {
	client: HfInference;

	constructor(
		public path: string = '/',
		public accessKey: string | null = null,
		public shouldInsertAttachmentMessages: boolean = true,
		public concatAttachmentsToMessage: boolean = false
	) {
		super(path, accessKey, shouldInsertAttachmentMessages, concatAttachmentsToMessage);
		this.client = new HfInference(process.env.HF_TOKEN);
	}

	protected async *getResponse(
		request: QueryRequest
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		for await (const chunk of this.client.chatCompletionStream({
			model: 'HuggingFaceH4/zephyr-7b-beta',
			messages: request.query
		})) {
			yield {
				...PartialResponse.defaultValues(),
				text: chunk.choices[0].delta.content ?? ''
			};
		}
	}
}
