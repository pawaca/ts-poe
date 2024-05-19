import { PoeBot } from 'ts-poe/base';
import {
	PartialResponse,
	SettingsResponse,
	MetaResponse,
	ErrorResponse,
	QueryRequest,
	type ReportFeedbackRequest
} from 'ts-poe/types';

/**
 * Demo bot: catbot.
 *
 * This bot uses all options provided by the Poe protocol. You can use it to get examples
 * of all the protocol has to offer.
 */
export class CatBot extends PoeBot {
	protected async *getResponse(request: QueryRequest): AsyncIterable<PartialResponse> {
		const lastMessage = request.query[request.query.length - 1].content.toLowerCase();
		const responseContentType = lastMessage.includes('plain') ? 'text/plain' : 'text/markdown';

		yield {
			...MetaResponse.defaultValues(),
			text: '',
			contentType: responseContentType,
			linkify: true,
			refetchSettings: false,
			suggestedReplies: !lastMessage.includes('dog')
		} as MetaResponse;

		if (lastMessage.includes('markdown')) {
			yield { ...PartialResponse.defaultValues(), text: '# Heading 1\n\n' };
			yield { ...PartialResponse.defaultValues(), text: '*Bold text* ' };
			yield { ...PartialResponse.defaultValues(), text: '**More bold text**\n' };
			yield { ...PartialResponse.defaultValues(), text: '\n' };
			yield { ...PartialResponse.defaultValues(), text: 'A list:\n' };
			yield { ...PartialResponse.defaultValues(), text: '- Item 1\n' };
			yield { ...PartialResponse.defaultValues(), text: '- Item 2\n' };
			yield {
				...PartialResponse.defaultValues(),
				text: '- An item with [a link](https://poe.com)\n'
			};
			yield { ...PartialResponse.defaultValues(), text: '\n' };
			yield { ...PartialResponse.defaultValues(), text: 'A table:\n\n' };
			yield { ...PartialResponse.defaultValues(), text: '| animal | cuteness |\n' };
			yield { ...PartialResponse.defaultValues(), text: '|--------|----------|\n' };
			yield { ...PartialResponse.defaultValues(), text: '| cat    | 10       |\n' };
			yield { ...PartialResponse.defaultValues(), text: '| dog    | 1        |\n' };
			yield { ...PartialResponse.defaultValues(), text: '\n' };
		}

		if (lastMessage.includes('cardboard')) {
			yield { ...PartialResponse.defaultValues(), text: 'crunch ' };
			yield { ...PartialResponse.defaultValues(), text: 'crunch' };
		} else if (
			lastMessage.includes('kitchen') ||
			lastMessage.includes('meal') ||
			lastMessage.includes('food')
		) {
			yield { ...PartialResponse.defaultValues(), text: 'meow ' };
			yield { ...PartialResponse.defaultValues(), text: 'meow' };
			yield { ...PartialResponse.defaultValues(), text: 'feed the cat', isSuggestedReply: true };
		} else if (lastMessage.includes('stranger')) {
			for (let i = 0; i < 10; i++) {
				yield { ...PartialResponse.defaultValues(), text: 'peek ' };
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		} else if (lastMessage.includes('square')) {
			yield { ...ErrorResponse.defaultValues(), text: 'Square snacks are not tasty.' };
		} else if (lastMessage.includes('cube')) {
			yield {
				...ErrorResponse.defaultValues(),
				text: 'Cube snacks are even less tasty.',
				allowRetry: false
			} as ErrorResponse;
		} else if (lastMessage.includes('count')) {
			for (let i = 1; i <= 10; i++) {
				yield {
					...PartialResponse.defaultValues(),
					text: i.toString(),
					isReplaceResponse: true
				};
				if (!lastMessage.includes('quickly')) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}
		} else if (lastMessage.includes('scratch')) {
			yield { ...PartialResponse.defaultValues(), text: 'purr' };
		} else if (lastMessage.includes('toy')) {
			for (let i = 0; i < 1010; i++) {
				yield { ...PartialResponse.defaultValues(), text: 'hit ' };
			}
		} else if (lastMessage.includes('bed')) {
			yield { ...PartialResponse.defaultValues(), text: 'z'.repeat(10010) };
		} else {
			yield { ...PartialResponse.defaultValues(), text: 'zzz' };
		}
	}

	protected async onFeedback(feedbackRequest: ReportFeedbackRequest): Promise<void> {
		console.log(
			`User ${feedbackRequest.userId} gave feedback on ${feedbackRequest.conversationId} message ${feedbackRequest.messageId}: ${feedbackRequest.feedbackType}`
		);
	}

	protected async getSettings(): Promise<SettingsResponse> {
		return {
			...SettingsResponse.defaultValues(),
			allowUserContextClear: true,
			allowAttachments: true
		} as SettingsResponse;
	}
}
