import { PoeBot } from 'ts-poe/base';
import { streamRequest } from 'ts-poe/client';
import type { ServerSentEvent } from 'ts-poe/sse';
import { SettingsResponse, type PartialResponse, type QueryRequest } from 'ts-poe/types';

/**
 * Sample bot that wraps GPT-3.5-Turbo but makes responses use all-caps.
 */
export class GPT35TurboAllCapsBot extends PoeBot {
	protected async *getResponse(
		request: QueryRequest
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		for await (const msg of streamRequest(request, 'GPT-3.5-Turbo', request.accessKey)) {
			yield { ...msg, text: msg.text.toUpperCase() };
		}
	}

	protected async getSettings(): Promise<SettingsResponse> {
		return { ...SettingsResponse.defaultValues(), serverBotDependencies: { 'GPT-3.5-Turbo': 2 } };
	}
}
