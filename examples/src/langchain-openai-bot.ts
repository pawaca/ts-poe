import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PoeBot } from 'ts-poe/base';
import { PartialResponse, type ProtocolMessage, type QueryRequest } from 'ts-poe/types';
import type { ServerSentEvent } from 'ts-poe/sse';

export class LangchainOpenAIChatBot extends PoeBot {
	private model = new ChatOpenAI({ model: 'gpt-4' });

	protected async *getResponse(
		request: QueryRequest
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		const messages: BaseMessage[] = request.query.map((message: ProtocolMessage) => {
			if (message.role === 'bot') {
				return new AIMessage(message.content);
			} else if (message.role === 'system') {
				return new SystemMessage(message.content);
			} else if (message.role === 'user') {
				return new HumanMessage(message.content);
			} else {
				throw new Error(`Unknown message role: ${message.role}`);
			}
		});
		const parser = new StringOutputParser();
		const resp = await this.model.pipe(parser).invoke(messages);

		yield {
			...PartialResponse.defaultValues(),
			text: resp
		};
	}
}
