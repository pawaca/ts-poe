import { PoeBot } from 'ts-poe/base';
import { streamRequest } from 'ts-poe/client';
import type { ServerSentEvent } from 'ts-poe/sse';
import { PartialResponse, ProtocolMessage, QueryRequest, SettingsResponse } from 'ts-poe/types';

/**
 * Sample bot that returns interleaved results from GPT-3.5-Turbo and Claude-instant.
 */

async function* combineStreams(
	...streams: AsyncIterable<PartialResponse>[]
): AsyncIterable<PartialResponse> {
	/**
	 * Combines a list of streams into one single response stream.
	 * Allows you to render multiple responses in parallel.
	 */
	const activeStreams = new Map(streams.map((stream, index) => [index, stream]));
	const responses: Map<number, string[]> = new Map();

	async function advanceStream(
		streamId: number,
		gen: AsyncIterable<PartialResponse>
	): Promise<[number, PartialResponse | null]> {
		try {
			const iterator = gen[Symbol.asyncIterator]();
			const result = await iterator.next();
			return [streamId, result.done ? null : result.value];
		} catch (e) {
			return [streamId, null];
		}
	}

	while (activeStreams.size > 0) {
		const tasks = [...activeStreams.entries()].map(([streamId, gen]) =>
			advanceStream(streamId, gen)
		);

		for (const promise of await Promise.all(tasks)) {
			const [streamId, msg] = promise;
			if (msg === null) {
				activeStreams.delete(streamId);
				continue;
			}

			if (msg instanceof Object && 'suggestedReplies' in msg) {
				continue;
			} else if (msg.isSuggestedReply) {
				yield msg;
				continue;
			} else if (msg.isReplaceResponse) {
				responses.set(streamId, [msg.text]);
			} else {
				if (!responses.has(streamId)) responses.set(streamId, []);
				responses.get(streamId)!.push(msg.text);
			}

			const text = Array.from(responses.values())
				.map((chunks) => chunks.join(''))
				.join('\n\n');
			yield { ...PartialResponse.defaultValues(), text, isReplaceResponse: true };
		}
	}
}

function preprocessMessage(message: ProtocolMessage, bot: string): ProtocolMessage {
	/**
	 * Process bot responses to keep only the parts that come from the given bot.
	 */
	if (message.role === 'bot') {
		const parts = message.content.split(/\*\*([A-Za-z_\-\d.]+)\*\* says:\n/);
		for (let i = 1; i < parts.length; i += 2) {
			const messageBot = parts[i];
			const text = parts[i + 1];
			if (messageBot.trim().toLowerCase() === bot.toLowerCase()) {
				return { ...message, content: text };
			}
		}
		return message;
	} else {
		return message;
	}
}

function preprocessQuery(request: QueryRequest, bot: string): QueryRequest {
	/**
	 * Parses the two bot responses and keeps the one for the current bot.
	 */
	const newQuery = {
		...request,
		query: request.query.map((message) => preprocessMessage(message, bot))
	};
	return newQuery;
}

async function* streamRequestWrapper(
	request: QueryRequest,
	bot: string
): AsyncIterable<PartialResponse> {
	/**
	 * Wraps streamRequest and labels the bot response with the bot name.
	 */
	const label = {
		...PartialResponse.defaultValues(),
		text: `**${bot}** says:\n`,
		isReplaceResponse: true
	};
	yield label;
	for await (const msg of streamRequest(preprocessQuery(request, bot), bot, request.accessKey)) {
		if (msg instanceof Error) {
			yield {
				...PartialResponse.defaultValues(),
				text: `**${bot}** ran into an error`,
				isReplaceResponse: true
			};
			return;
		} else if (msg.isReplaceResponse) {
			yield label;
		}
		yield { ...msg, isReplaceResponse: false };
	}
}

export class GPT35TurbovsClaudeBot extends PoeBot {
	protected async *getResponse(
		request: QueryRequest
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		const streams = ['GPT-3.5-Turbo', 'Claude-instant'].map((bot) =>
			streamRequestWrapper(request, bot)
		);
		for await (const msg of combineStreams(...streams)) {
			yield msg;
		}
	}

	protected async getSettings(): Promise<SettingsResponse> {
		return {
			...SettingsResponse.defaultValues(),
			serverBotDependencies: { 'GPT-3.5-Turbo': 1, 'Claude-instant': 1 }
		};
	}
}
