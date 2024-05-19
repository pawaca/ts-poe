/**
 * Client for talking to other Poe bots through the Poe bot query API.
 * For more details, see: https://creator.poe.com/docs/server-bots-functional-guides#accessing-other-bots-on-poe
 */

import axios, { AxiosError, isAxiosError, type AxiosInstance } from 'axios';
import { EventSource } from './sse';

import { QueryRequest } from './types';
import type {
	SettingsResponse,
	PartialResponse,
	ToolDefinition,
	ToolCallDefinition,
	ToolResultDefinition,
	MetaResponse,
	ProtocolMessage,
	ContentType
} from './types';
import {
	isBotErrorNoRetry,
	isError,
	isMetaMessage,
	isAsyncResult,
	modelDump,
	camelToSnakeCase,
	safeEllipsis
} from './internal/utils';
import type { ChatCompletionChunk } from './internal/openai';
import type { JsonMap } from './internal/types';
import { logger } from './logger';

export const PROTOCOL_VERSION = '1.0';
export const MESSAGE_LENGTH_LIMIT = 10_000;

export const IDENTIFIER_LENGTH = 32;
export const MAX_EVENT_COUNT = 1000;

export type ErrorHandler = (e: Error, msg: string) => void;

/**
 * Raised when there is an error communicating with the bot.
 */
export class BotError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BotError';
	}
}

/**
 * Subclass of BotError raised when we're not allowed to retry.
 */
export class BotErrorNoRetry extends BotError {
	constructor(message: string) {
		super(message);
		this.name = 'BotErrorNoRetry';
	}
}

/**
 * Raised when a bot returns invalid settings.
 */
export class InvalidBotSettings extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidBotSettings';
	}
}

export interface AsyncResult {
	result?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AsyncCallable<T extends any[] = any[]> = {
	(...args: T): AsyncIterable<PartialResponse | AsyncResult>;
	name: string;
};

class BotContext {
	endpoint: string;
	session: AxiosInstance;
	apiKey?: string;
	onError?: ErrorHandler;

	constructor(options: {
		endpoint: string;
		session: AxiosInstance;
		apiKey?: string;
		onError?: ErrorHandler;
	}) {
		this.endpoint = options.endpoint;
		this.session = options.session;
		this.apiKey = options.apiKey;
		this.onError = options.onError;
	}

	get headers(): Record<string, string> {
		const headers: Record<string, string> = {
			Accept: 'application/json'
		};
		if (this.apiKey) {
			headers.Authorization = `Bearer ${this.apiKey}`;
		}
		return headers;
	}

	/**
	 * Report an error to the bot server.
	 */
	async reportError(message: string, metadata?: Record<string, unknown>): Promise<void> {
		if (this.onError) {
			const longMessage = `Protocol bot error: ${message} with metadata ${JSON.stringify(metadata)} for endpoint ${this.endpoint}`;
			this.onError(new BotError(message), longMessage);
		}
		await this.session.post(
			this.endpoint,
			{
				version: PROTOCOL_VERSION,
				type: 'report_error',
				message,
				metadata: metadata || {}
			},
			{ headers: this.headers }
		);
	}

	/**
	 * Report message feedback to the bot server.
	 */
	async reportFeedback(
		messageId: string,
		userId: string,
		conversationId: string,
		feedbackType: string
	): Promise<void> {
		await this.session.post(
			this.endpoint,
			{
				version: PROTOCOL_VERSION,
				type: 'report_feedback',
				message_id: messageId,
				user_id: userId,
				conversation_id: conversationId,
				feedback_type: feedbackType
			},
			{ headers: this.headers }
		);
	}

	/**
	 * Fetches settings from a Poe server bot endpoint.
	 */
	async fetchSettings(): Promise<SettingsResponse> {
		const response = await this.session.post(
			this.endpoint,
			{
				version: PROTOCOL_VERSION,
				type: 'settings'
			},
			{ headers: this.headers }
		);
		return response.data;
	}

	async *performQueryRequest(
		request: QueryRequest,
		tools?: ToolDefinition[],
		toolCalls?: ToolCallDefinition[],
		toolResults?: ToolResultDefinition[]
	): AsyncIterable<PartialResponse> {
		const chunks: string[] = [];
		const messageId = request.messageId;
		let eventCount = 0;
		let errorReported = false;
		const payload = modelDump(request) as JsonMap;
		if (tools) {
			payload.tools = tools.map((tool) => modelDump(tool));
		}
		if (toolCalls) {
			payload.tool_calls = toolCalls.map((toolCall) => modelDump(toolCall));
		}
		if (toolResults) {
			payload.tool_results = toolResults.map((toolResult) => modelDump(toolResult));
		}
		logger.debug(
			'Perform query request with payload: ',
			JSON.stringify({ payload, headers: this.headers, endpoint: this.endpoint })
		);
		const response = await this.session.post(this.endpoint, payload, {
			headers: this.headers,
			responseType: 'stream'
		});

		const eventSource = new EventSource(response);

		for await (const sse of eventSource.iterSSE()) {
			eventCount += 1;
			if (sse.event === 'done') {
				if (!chunks.length && !errorReported && !tools) {
					await this.reportError('Bot returned no text in response', { messageId });
				}
				return;
			} else if (sse.event === 'text') {
				const text = await this.getSingleJsonField(sse.data!, 'text', messageId);
				chunks.push(text);
				yield {
					text,
					rawResponse: { type: sse.event, text: sse.data },
					fullPrompt: JSON.stringify(payload),
					isSuggestedReply: false,
					isReplaceResponse: false
				};
			} else if (sse.event === 'replace_response') {
				const text = await this.getSingleJsonField(sse.data!, 'replace_response', messageId);
				chunks.splice(0, chunks.length);
				chunks.push(text);
				yield {
					text,
					rawResponse: { type: sse.event, text: sse.data },
					fullPrompt: JSON.stringify(payload),
					isSuggestedReply: false,
					isReplaceResponse: true
				};
			} else if (sse.event === 'suggested_reply') {
				const text = await this.getSingleJsonField(sse.data!, 'suggested_reply', messageId);
				yield {
					text,
					rawResponse: { type: sse.event, text: sse.data },
					fullPrompt: JSON.stringify(payload),
					isSuggestedReply: true,
					isReplaceResponse: false
				};
			} else if (sse.event === 'json') {
				yield {
					text: '',
					data: JSON.parse(sse.data!),
					fullPrompt: JSON.stringify(payload),
					isSuggestedReply: false,
					isReplaceResponse: false
				};
			} else if (sse.event === 'meta') {
				if (eventCount !== 1) continue;
				const data = await this.loadJsonDict(sse.data!, 'meta', messageId);
				const linkify = data['linkify'] ?? false;
				if (typeof linkify !== 'boolean') {
					await this.reportError("Invalid linkify value in 'meta' event", {
						message_id: messageId,
						linkify: linkify
					});
					errorReported = true;
					continue;
				}
				const sendSuggestedReplies = data['suggested_replies'] ?? false;
				if (typeof sendSuggestedReplies !== 'boolean') {
					await this.reportError("Invalid suggested_replies value in 'meta' event", {
						message_id: messageId,
						suggested_replies: sendSuggestedReplies
					});
					errorReported = true;
					continue;
				}
				const contentType = data['content_type'] ?? 'text/markdown';
				if (typeof contentType !== 'string') {
					await this.reportError("Invalid content_type value in 'meta' event", {
						message_id: messageId,
						content_type: contentType
					});
					errorReported = true;
					continue;
				}
				yield {
					text: '',
					rawResponse: data,
					fullPrompt: JSON.stringify(payload),
					linkify: linkify,
					suggestedReplies: sendSuggestedReplies,
					contentType: contentType as ContentType
				} as MetaResponse;
			} else if (sse.event === 'error') {
				const data = await this.loadJsonDict(sse.data!, 'error', messageId);
				if (data['allow_retry'] ?? true) {
					throw new BotError(sse.data!);
				} else {
					throw new BotErrorNoRetry(sse.data!);
				}
			} else if (sse.event === 'ping') {
				continue;
			} else {
				await this.reportError(`Unknown event type: ${safeEllipsis(sse.event, 100)}`, {
					event_data: safeEllipsis(sse.data, 500),
					message_id: messageId
				});
				errorReported = true;
			}
		}
		await this.reportError("Bot exited without sending 'done' event", { message_id: messageId });
	}

	private async getSingleJsonField(
		data: string,
		context: string,
		messageId: string,
		field: string = 'text'
	): Promise<string> {
		const dataDict = await this.loadJsonDict(data, context, messageId);
		const text = dataDict[field];
		if (typeof text !== 'string') {
			await this.reportError(`Expected string in '${field}' field for '${context}' event`, {
				data: dataDict,
				message_id: messageId
			});
			throw new BotErrorNoRetry(`Expected string in '${context}' event`);
		}
		return text;
	}

	private async loadJsonDict(
		data: string,
		context: string,
		messageId: string
	): Promise<Record<string, unknown>> {
		try {
			const parsed = JSON.parse(data);
			if (typeof parsed !== 'object' || parsed === null) {
				await this.reportError(`Expected JSON dict in ${context} event`, {
					data,
					message_id: messageId
				});
				throw new BotError(`Expected JSON dict in ${context} event`);
			}
			return parsed as Record<string, unknown>;
		} catch (err) {
			await this.reportError(`Invalid JSON in ${context} event`, { data, message_id: messageId });
			throw new BotErrorNoRetry(`Invalid JSON in ${context} event`);
		}
	}
}

function defaultErrorHandler(e: Error, msg: string): void {
	logger.error('Error in Poe bot:', msg, '\n', e);
}

/**
 * The Entry point for the Bot Query API. This API allows you to use other bots on Poe for
 * inference in response to a user message. For more details, checkout:
 * https://creator.poe.com/docs/server-bots-functional-guides#accessing-other-bots-on-poe
 *
 * #### Parameters:
 * - `request` (`QueryRequest`): A QueryRequest object representing a query from Poe. This object
 *   also includes information needed to identify the user for compute point usage.
 * - `botName` (`string`): The bot you want to invoke.
 * - `apiKey` (`string = ""`): Your Poe API key, available at poe.com/api_key. You will need
 *   this in case you are trying to use this function from a script/shell. Note that if an `api_key`
 *   is provided, compute points will be charged on the account corresponding to the `api_key`.
 * - `options.tools` (`ToolDefinition[] | undefined = undefined`): A list of ToolDefinition objects describing
 *   the functions you have. This is used for OpenAI function calling.
 * - `options.toolExecutables` (`NamedAsyncCallable[] | undefined = undefined`): A list of functions corresponding
 *   to the ToolDefinitions. This is used for OpenAI function calling.
 */
export async function* streamRequest(
	request: QueryRequest,
	botName: string,
	apiKey: string = '',
	options: {
		tools?: ToolDefinition[];
		toolExecutables?: AsyncCallable[];
		accessKey?: string;
		accessKeyDeprecationWarningStackLevel?: number;
		session?: AxiosInstance;
		onError?: ErrorHandler;
		numTries?: number;
		retrySleepTime?: number;
		baseUrl?: string;
	} = {}
): AsyncIterable<PartialResponse> {
	const {
		tools,
		toolExecutables,
		accessKey = '',
		accessKeyDeprecationWarningStackLevel = 2,
		session,
		onError = defaultErrorHandler,
		numTries = 2,
		retrySleepTime = 0.5,
		baseUrl = 'https://api.poe.com/bot/'
	} = options;

	if (tools && toolExecutables) {
		const toolCalls = await getToolCalls(request, botName, apiKey, {
			tools,
			accessKey,
			accessKeyDeprecationWarningStackLevel,
			session,
			onError,
			numTries,
			retrySleepTime,
			baseUrl
		});

		for await (const toolMessage of getToolResults(toolExecutables, toolCalls)) {
			if (Array.isArray(toolMessage)) {
				const toolResults = toolMessage as ToolResultDefinition[];
				for await (const message of streamRequestBase(request, botName, apiKey, {
					tools,
					toolCalls,
					toolResults,
					accessKey,
					accessKeyDeprecationWarningStackLevel,
					session,
					onError,
					numTries,
					retrySleepTime,
					baseUrl
				})) {
					yield message;
				}
			} else {
				yield toolMessage;
			}
		}
	} else {
		for await (const message of streamRequestBase(request, botName, apiKey, {
			tools,
			accessKey,
			accessKeyDeprecationWarningStackLevel,
			session,
			onError,
			numTries,
			retrySleepTime,
			baseUrl
		})) {
			yield message;
		}
	}
}

async function* getToolResults(
	toolExecutables: AsyncCallable[],
	toolCalls: ToolCallDefinition[]
): AsyncIterable<PartialResponse | ToolResultDefinition[]> {
	const toolExecutablesDict: { [name: string]: AsyncCallable } = {};
	toolExecutables.forEach((executable) => {
		toolExecutablesDict[camelToSnakeCase(executable.name)] = executable;
	});

	const toolResults: ToolResultDefinition[] = [];

	for (const toolCall of toolCalls) {
		const toolCallId = toolCall.id;
		const name = toolCall.function.name;
		const argumentsObj = JSON.parse(toolCall.function.arguments);

		// Execute the tool function and handle the responses
		const toolFunction = toolExecutablesDict[name];
		if (toolFunction) {
			for await (const resp of toolFunction(argumentsObj)) {
				if (isAsyncResult(resp)) {
					toolResults.push({
						role: 'tool',
						toolCallId: toolCallId,
						name: name,
						content: JSON.stringify(resp.result)
					});
				} else {
					yield resp;
				}
			}
		}
	}

	yield toolResults;
}

async function getToolCalls(
	request: QueryRequest,
	botName: string,
	apiKey: string = '',
	options: {
		tools: ToolDefinition[];
		accessKey?: string;
		accessKeyDeprecationWarningStackLevel?: number;
		session?: AxiosInstance;
		onError?: ErrorHandler;
		numTries?: number;
		retrySleepTime?: number;
		baseUrl?: string;
	} = { tools: [] }
): Promise<ToolCallDefinition[]> {
	const toolCallObjectDict: Record<number, ChatCompletionChunk.Choice.Delta.ToolCall> = {};
	const {
		tools,
		accessKey = '',
		accessKeyDeprecationWarningStackLevel = 2,
		session,
		onError = defaultErrorHandler,
		numTries = 2,
		retrySleepTime = 0.5,
		baseUrl = 'https://api.poe.com/bot/'
	} = options;

	for await (const message of streamRequestBase(request, botName, apiKey, {
		tools,
		accessKey,
		accessKeyDeprecationWarningStackLevel,
		session,
		onError,
		numTries,
		retrySleepTime,
		baseUrl
	})) {
		if (message.data) {
			const data: ChatCompletionChunk = message.data as ChatCompletionChunk;
			if (data && data.choices && data.choices.length > 0 && !data.choices[0].finish_reason) {
				try {
					const toolCallObject = data.choices[0].delta.tool_calls![0];
					const index = toolCallObject.index;
					if (!(index in toolCallObjectDict)) {
						toolCallObjectDict[index] = toolCallObject;
					} else {
						const toolCallObjectInDict = toolCallObjectDict[index];
						toolCallObjectInDict.function!.arguments += toolCallObject.function!.arguments!;
					}
				} catch (error) {
					continue;
				}
			}
		}
	}

	const sortedToolCallObjects = Object.values(toolCallObjectDict).sort((a, b) => a.index - b.index);
	const result = [];
	for (const toolCallObject of sortedToolCallObjects) {
		try {
			result.push({
				id: toolCallObject.id!,
				type: toolCallObject.type!,
				function: {
					name: toolCallObject.function!.name!,
					arguments: toolCallObject.function!.arguments!
				}
			});
		} catch (error) {
			continue;
		}
	}
	return result;
}

async function* streamRequestBase(
	request: QueryRequest,
	botName: string,
	apiKey: string = '',
	options: {
		tools?: ToolDefinition[];
		toolCalls?: ToolCallDefinition[];
		toolResults?: ToolResultDefinition[];
		accessKey?: string;
		accessKeyDeprecationWarningStackLevel?: number;
		session?: AxiosInstance;
		onError?: ErrorHandler;
		numTries?: number;
		retrySleepTime?: number;
		baseUrl?: string;
	} = {}
): AsyncIterable<PartialResponse> {
	const {
		tools,
		toolCalls,
		toolResults,
		accessKey = '',
		session = axios.create({ timeout: 600000 }),
		onError = defaultErrorHandler,
		numTries = 2,
		retrySleepTime = 0.5,
		baseUrl = 'https://api.poe.com/bot/'
	} = options;

	if (accessKey !== '') {
		logger.warn('The access_key param is no longer necessary when using this function.');
	}

	const endpoint = `${baseUrl}${botName}`;
	const ctx = new BotContext({ endpoint, apiKey, session, onError });
	let gotResponse = false;

	for (let i = 0; i < numTries; i++) {
		try {
			for await (const message of ctx.performQueryRequest(request, tools, toolCalls, toolResults)) {
				gotResponse = true;
				yield message;
			}
			break;
		} catch (e) {
			if (isBotErrorNoRetry(e)) {
				throw e;
			} else if (isError(e)) {
				onError(e as Error, `Bot request to ${botName} failed on try ${i}`);

				const allowRetryAfterResponse =
					isAxiosError(e) && (e as AxiosError).code === 'ECONNABORTED';
				if ((gotResponse && !allowRetryAfterResponse) || i === numTries - 1) {
					throw new BotError(`Error communicating with bot ${botName}`);
				}

				await new Promise((resolve) => setTimeout(resolve, retrySleepTime * 1000));
			}
		}
	}
}

/**
 * Use this function to invoke another Poe bot from your shell.
 *
 * #### Parameters:
 * - `messages` (`ProtocolMessage[]`): A list of messages representing your conversation.
 * - `botName` (`string`): The bot that you want to invoke.
 * - `apiKey` (`string`): Your Poe API key. This is available at: [poe.com/api_key](https://poe.com/api_key)
 */
export async function* getBotResponse(
	messages: ProtocolMessage[],
	botName: string,
	apiKey: string,
	options: {
		tools?: ToolDefinition[];
		toolExecutables?: AsyncCallable[];
		temperature?: number;
		skipSystemPrompt?: boolean;
		logitBias?: { [key: string]: number };
		stopSequences?: string[];
		baseUrl?: string;
		session?: AxiosInstance;
	} = {}
): AsyncIterable<PartialResponse> {
	const {
		tools,
		toolExecutables,
		temperature,
		skipSystemPrompt,
		logitBias,
		stopSequences,
		baseUrl = 'https://api.poe.com/bot/',
		session
	} = options;

	const query: QueryRequest = {
		...QueryRequest.defaultValues(),
		version: PROTOCOL_VERSION,
		type: 'query',
		query: messages,
		userId: '',
		conversationId: '',
		messageId: ''
	};

	if (temperature !== undefined) {
		query.temperature = temperature;
	}
	if (skipSystemPrompt !== undefined) {
		query.skipSystemPrompt = skipSystemPrompt;
	}
	if (logitBias !== undefined) {
		query.logitBias = logitBias;
	}
	if (stopSequences !== undefined) {
		query.stopSequences = stopSequences;
	}

	for await (const message of streamRequest(query, botName, apiKey, {
		tools,
		toolExecutables,
		session,
		baseUrl
	})) {
		yield message;
	}
}

/**
 * A helper function for the bot query API that waits for all the tokens and concatenates the full
 * response before returning.
 *
 * #### Parameters:
 * - `request` (`QueryRequest`): A QueryRequest object representing a query from Poe. This object
 *   also includes information needed to identify the user for compute point usage.
 * - `botName` (`string`): The bot you want to invoke.
 * - `apiKey` (`string = ""`): Your Poe API key, available at poe.com/api_key. You will need this in
 *   case you are trying to use this function from a script/shell. Note that if an `apiKey` is
 *   provided, compute points will be charged on the account corresponding to the `apiKey`.
 */
export async function getFinalResponse(
	request: QueryRequest,
	botName: string,
	apiKey: string = '',
	options: {
		accessKey?: string;
		session?: AxiosInstance;
		onError?: ErrorHandler;
		numTries?: number;
		retrySleepTime?: number;
		baseUrl?: string;
	} = {}
): Promise<string> {
	const chunks: string[] = [];
	const {
		accessKey = '',
		session,
		onError = defaultErrorHandler,
		numTries = 2,
		retrySleepTime = 0.5,
		baseUrl = 'https://api.poe.com/bot/'
	} = options;
	for await (const message of streamRequest(request, botName, apiKey, {
		accessKey,
		accessKeyDeprecationWarningStackLevel: 3,
		session,
		onError,
		numTries,
		retrySleepTime,
		baseUrl
	})) {
		if (isMetaMessage(message)) {
			continue;
		}
		if (message.isSuggestedReply) {
			continue;
		}
		if (message.isReplaceResponse) {
			chunks.splice(0, chunks.length);
		}
		chunks.push(message.text);
	}
	if (chunks.length === 0) {
		throw new BotError(`Bot ${botName} sent no response`);
	}
	return chunks.join('');
}
