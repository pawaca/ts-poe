/* eslint-disable @typescript-eslint/no-unused-vars */
import FormData from 'form-data';
import axios, { type AxiosRequestConfig } from 'axios';

import { type ServerSentEvent } from './sse';
import {
	imageVisionAttachmentTemplate,
	textAttachmentTemplate,
	urlAttachmentTemplate
} from './templates';
import { QueryRequest, ProtocolMessage } from './types';
import type {
	SettingsRequest,
	ReportFeedbackRequest,
	ReportErrorRequest,
	SettingsResponse,
	PartialResponse,
	AttachmentUploadResponse,
	ErrorResponse,
	MetaResponse,
	Identifier,
	ContentType,
	RequestContext,
	Attachment
} from './types';
import {
	isErrorMessage,
	isEventMessage,
	isMetaMessage,
	isPartialMessage,
	modelDump
} from './internal/utils';
import { logger } from './logger';

export class InvalidParameterError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidParameterError';
	}
}

export class AttachmentUploadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AttachmentUploadError';
	}
}

export class HTTPException extends Error {
	constructor(
		public statusCode: number,
		public message: string,
		public detail: unknown = undefined,
		public headers?: unknown
	) {
		super(message);
		this.statusCode = statusCode;
		this.detail = detail;
		this.headers = headers;
		this.name = 'HTTPException';
	}
}

/**
 * The class that you use to define your bot behavior. Once you define your PoeBot class, you
 * pass it to `makeApp` to create a Express app that serves your bot.
 *
 * #### Parameters:
 * - `path` (`string = "/"`): This is the path at which your bot is served. By default, it's
 *   set to "/" but this is something you can adjust. This is especially useful if you want to serve
 *   multiple bots from one server.
 * - `accessKey` (`string | null = null`): This is the access key for your bot and when
 *   provided is used to validate that the requests are coming from a trusted source. This access key
 *   should be the same one that you provide when integrating your bot with Poe at:
 *   https://poe.com/create_bot?server=1. You can also set this to null but certain features like
 *   file output that mandate an `accessKey` will not be available for your bot.
 * - `shouldInsertAttachmentMessages` (`boolean = true`): A flag to decide whether to parse out
 *   content from attachments and insert them as messages into the conversation. This is set to
 *   `true` by default and we recommend leaving it on since it allows your bot to comprehend attachments
 *   uploaded by users by default.
 * - `concatAttachmentsToMessage` (`boolean = false`): Deprecated. This was used to concatenate
 *   attachment content to the message body. This is now handled by `insertAttachmentMessages`.
 *   This will be removed in a future release.
 */
export class PoeBot {
	private pendingFileAttachmentTasks: {
		[messageId: string]: Promise<AttachmentUploadResponse>[];
	} = {};

	constructor(
		public path: string = '/',
		public accessKey: string | null = null,
		public shouldInsertAttachmentMessages: boolean = true,
		public concatAttachmentsToMessage: boolean = false
	) {}

	// Override these methods for your bot

	/**
	 * Override this to define your bot's response given a user query.
	 * #### Parameters:
	 * - `request` (`QueryRequest`): an object representing the chat response request from Poe.
	 *   This will contain information about the chat state among other things.
	 *
	 * #### Returns:
	 * - `AsyncIterable<PartialResponse>`: objects representing your
	 *   response to the Poe servers. This is what gets displayed to the user.
	 *
	 * Example usage:
	 * ```typescript
	 * async *getResponse(request: QueryRequest): AsyncIterable<PartialResponse> {
	 *     const lastMessage = request.query[request.query.length - 1].content;
	 *     yield { text: lastMessage };
	 * }
	 * ```
	 */
	protected async *getResponse(
		request: QueryRequest
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		// Implement your bot's response logic here
		yield PoeBot.textEvent('Hello, world!');
	}

	/**
	 * A version of `getResponse` that also includes the request context information. By
	 * default, this will call `getResponse`.
	 * #### Parameters:
	 * - `request` (`QueryRequest`): an object representing the chat response request from Poe.
	 *   This will contain information about the chat state among other things.
	 * - `context` (`RequestContext`): an object representing the current HTTP request.
	 *
	 * #### Returns:
	 * - `AsyncIterable<PartialResponse | ErrorResponse>`: objects representing your
	 *   response to the Poe servers. This is what gets displayed to the user.
	 */
	protected async *getResponseWithContext(
		request: QueryRequest,
		context: RequestContext
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		for await (const event of this.getResponse(request)) {
			yield event;
		}
	}

	/**
	 * Override this to define your bot's settings.
	 *
	 * #### Parameters:
	 * - `setting` (`SettingsRequest`): An object representing the settings request.
	 *
	 * #### Returns:
	 * - `SettingsResponse`: An object representing the settings you want to use for your bot.
	 */
	protected async getSettings(settingsRequest: SettingsRequest): Promise<SettingsResponse> {
		return Promise.resolve({
			serverBotDependencies: {},
			allowAttachments: false,
			introductionMessage: '',
			expandTextAttachments: true,
			enableImageComprehension: false,
			enforceAuthorRoleAlternation: false,
			enableMultiBotChatPrompting: false
		});
	}

	/**
	 * A version of `getSettings` that also includes the request context information. By
	 * default, this will call `getSettings`.
	 *
	 * #### Parameters:
	 * - `setting` (`SettingsRequest`): An object representing the settings request.
	 * - `context` (`RequestContext`): an object representing the current HTTP request.
	 *
	 * #### Returns:
	 * - `SettingsResponse`: An object representing the settings you want to use for your bot.
	 */
	protected async getSettingsWithContext(
		settingsRequest: SettingsRequest,
		context: RequestContext
	): Promise<SettingsResponse> {
		return this.getSettings(settingsRequest);
	}

	/**
	 * Override this to record feedback from the user.
	 *
	 * #### Parameters:
	 * - `feedbackRequest` (`ReportFeedbackRequest`): An object representing the feedback request
	 *   from Poe. This is sent out when a user provides feedback on a response from your bot.
	 *
	 * #### Returns: `void`
	 */
	protected async onFeedback(feedbackRequest: ReportFeedbackRequest): Promise<void> {
		// Implement your feedback handling logic here
	}

	/**
	 * A version of `onFeedback` that also includes the request context information. By
	 * default, this will call `onFeedback`.
	 *
	 * #### Parameters:
	 * - `feedbackRequest` (`ReportFeedbackRequest`): An object representing a feedback request
	 *   from Poe. This is sent out when a user provides feedback on a response from your bot.
	 * - `context` (`RequestContext`): an object representing the current HTTP request.
	 *
	 * #### Returns: `void`
	 */
	protected async onFeedbackWithContext(
		feedbackRequest: ReportFeedbackRequest,
		context: RequestContext
	): Promise<void> {
		await this.onFeedback(feedbackRequest);
	}

	/**
	 * Override this to record errors from the Poe server.
	 *
	 * #### Parameters:
	 * - `errorRequest` (`ReportErrorRequest`): An object representing an error request from Poe.
	 *   This is sent out when the Poe server runs into an issue processing the response from your
	 *   bot.
	 *
	 * #### Returns: `void`
	 */
	protected async onError(errorRequest: ReportErrorRequest): Promise<void> {
		// Implement your error handling logic here
		logger.error('Error from Poe server:', errorRequest);
	}

	/**
	 * A version of `onError` that also includes the request context information. By
	 * default, this will call `onError`.
	 *
	 * #### Parameters:
	 * - `errorRequest` (`ReportErrorRequest`): An object representing an error request from Poe.
	 *   This is sent out when the Poe server runs into an issue processing the response from your
	 *   bot.
	 * - `context` (`RequestContext`): an object representing the current HTTP request.
	 *
	 * #### Returns: `void`
	 */
	protected async onErrorWithContext(
		errorRequest: ReportErrorRequest,
		context: RequestContext
	): Promise<void> {
		await this.onError(errorRequest);
	}

	/**
	 * Used to output an attachment in your bot's response.
	 *
	 * #### Parameters:
	 * - `messageId` (`Identifier`): The message id associated with the current QueryRequest
	 *   object. **Important**: This must be the request that is currently being handled by
	 *   `getResponse`. Attempting to attach files to previously handled requests will fail.
	 * - `accessKey` (`string`): The access key corresponding to your bot. This is needed to ensure
	 *   that file upload requests are coming from an authorized source.
	 * - `downloadUrl` (`Optional<string>` = `null`): A URL to the file to be attached to the message.
	 * - `fileData` (`Optional<Uint8Array | ReadableStream>` = `null`): The contents of the file to be
	 *   uploaded. This should be a bytes-like or stream object.
	 * - `filename` (`Optional<string>` = `null`): The name of the file to be attached.
	 *
	 * #### Returns:
	 * - `AttachmentUploadResponse`
	 *
	 * **Note**: You need to provide either the `downloadUrl` or both of `fileData` and `filename`.
	 */
	async postMessageAttachment(
		messageId: Identifier,
		accessKey?: string,
		options: {
			downloadUrl?: string;
			fileData?: Buffer;
			filename?: string;
			contentType?: string;
			isInline?: boolean;
		} = {}
	): Promise<AttachmentUploadResponse> {
		const { downloadUrl, fileData, filename, contentType, isInline = false } = options;

		if (!messageId) {
			throw new InvalidParameterError('messageId parameter is required');
		}

		const task = this.makeFileAttachmentRequest(messageId, {
			accessKey,
			downloadUrl,
			fileData,
			filename,
			contentType,
			isInline
		});

		const pendingTasksForMessage = this.pendingFileAttachmentTasks[messageId];
		if (!pendingTasksForMessage) {
			const newSet = new Array<Promise<AttachmentUploadResponse>>();
			newSet.push(task);
			this.pendingFileAttachmentTasks[messageId] = newSet;
		} else {
			pendingTasksForMessage.push(task);
		}

		try {
			return await task;
		} finally {
			const index = pendingTasksForMessage?.findIndex((item) => item === task);
			if (index !== -1) {
				pendingTasksForMessage?.splice(index, 1);
			}
		}
	}

	private async makeFileAttachmentRequest(
		messageId: Identifier,
		options: {
			accessKey?: string;
			downloadUrl?: string;
			fileData?: Buffer;
			filename?: string;
			contentType?: string;
			isInline?: boolean;
		}
	): Promise<AttachmentUploadResponse> {
		const { accessKey, downloadUrl, fileData, filename, contentType, isInline = false } = options;

		let attachmentAccessKey = '';
		if (this.accessKey) {
			if (accessKey) {
				logger.warn('Bot already has an access key, accessKey parameter is not needed.');
			}
			attachmentAccessKey = accessKey || this.accessKey;
		} else {
			if (!accessKey) {
				throw new InvalidParameterError(
					'accessKey parameter is required if bot is not provided with an accessKey when makeApp is called.'
				);
			}
			attachmentAccessKey = accessKey;
		}

		const url = 'https://www.quora.com/poe_api/file_attachment_3RD_PARTY_POST';
		const headers = { Authorization: attachmentAccessKey };

		let requestConfig: AxiosRequestConfig;
		if (downloadUrl) {
			if (fileData || filename) {
				throw new InvalidParameterError(
					'Cannot provide filename or fileData if downloadUrl is provided.'
				);
			}
			requestConfig = {
				method: 'POST',
				url,
				headers,
				data: {
					message_id: messageId,
					is_inline: isInline,
					download_url: downloadUrl
				}
			};
		} else if (fileData && filename) {
			const formData = new FormData();
			formData.append('file', fileData, { filename, contentType });
			formData.append('message_id', messageId);
			formData.append('is_inline', isInline.toString());
			requestConfig = {
				method: 'POST',
				url,
				headers: {
					...headers,
					'Content-Type': 'multipart/form-data'
				},
				data: formData
			};
		} else {
			throw new InvalidParameterError('Must provide either downloadUrl or fileData and filename.');
		}

		try {
			if (fileData && filename) {
				logger.debug(
					`--> UPLOAD_FILE|${JSON.stringify({ ...requestConfig, data: { filename, contentType, messageId, isInline } })}`
				);
			} else {
				logger.debug(`--> UPLOAD_FILE|${JSON.stringify(requestConfig)}`);
			}
			const response = await axios.request(requestConfig);
			const responseData = response.data;
			logger.debug(`<-- UPLOAD_FILE_RESP|${JSON.stringify(responseData)}`);
			return {
				inlineRef: responseData.inline_ref,
				attachmentUrl: responseData.attachment_url
			};
		} catch (error) {
			if (axios.isAxiosError(error)) {
				logger.error('An HTTP error occurred when attempting to attach file');
			}
			throw error;
		}
	}

	private async processPendingAttachmentRequests(messageId: Identifier): Promise<void> {
		try {
			const pendingTasks = this.pendingFileAttachmentTasks[messageId];
			if (pendingTasks) {
				await Promise.all(pendingTasks);
				delete this.pendingFileAttachmentTasks[messageId];
			}
		} catch (error) {
			logger.error('Error processing pending attachment requests');
			throw error;
		}
	}

	/**
	 * @deprecated This method is deprecated. Use `insertAttachmentMessages` instead.
	 * This method will be removed in a future release.
	 *
	 * Concatenate received attachment file content into the message body. This will be called
	 * by default if `concatAttachmentsToMessage` is set to `True` but can also be used
	 * manually if needed.
	 *
	 * #### Parameters:
	 * - `queryRequest` (`QueryRequest`): The request object from Poe.
	 *
	 * #### Returns:
	 * - `QueryRequest`: The request object after the attachments are unpacked and added to the
	 *   message body.
	 */
	private concatAttachmentContentToMessageBody(queryRequest: QueryRequest): QueryRequest {
		const lastMessage = queryRequest.query[queryRequest.query.length - 1];
		let concatenatedContent = lastMessage.content;

		for (const attachment of lastMessage.attachments) {
			if (attachment.parsedContent) {
				if (attachment.contentType === 'text/html') {
					const urlAttachmentContent = urlAttachmentTemplate(
						attachment.name,
						attachment.parsedContent
					);
					concatenatedContent += `\n\n${urlAttachmentContent}`;
				} else if (attachment.contentType.startsWith('text/')) {
					const textAttachmentContent = textAttachmentTemplate(
						attachment.name,
						attachment.parsedContent
					);
					concatenatedContent += `\n\n${textAttachmentContent}`;
				} else if (attachment.contentType.startsWith('image/')) {
					const [filename, parsedContentText] = attachment.parsedContent.split('***');
					const imageAttachmentContent = imageVisionAttachmentTemplate(filename, parsedContentText);
					concatenatedContent += `\n\n${imageAttachmentContent}`;
				}
			}
		}

		const modifiedLastMessage = { ...lastMessage, content: concatenatedContent };
		const modifiedQuery = {
			...queryRequest,
			query: [...queryRequest.query.slice(0, -1), modifiedLastMessage]
		};
		return modifiedQuery;
	}

	/**
	 * Insert messages containing the contents of each user attachment right before the last user
	 * message. This ensures the bot can consider all relevant information when generating a
	 * response. This will be called by default if `shouldInsertAttachmentMessages` is set to `True`
	 * but can also be used manually if needed.
	 *
	 * @param queryRequest - the request object from Poe.
	 * @returns The request object after the attachments are unpacked and added to the message body.
	 */
	private insertAttachmentMessages(queryRequest: QueryRequest): QueryRequest {
		const lastMessage = queryRequest.query[queryRequest.query.length - 1];
		const textAttachmentMessages: ProtocolMessage[] = [];
		const imageAttachmentMessages: ProtocolMessage[] = [];

		lastMessage.attachments?.forEach((attachment) => {
			if (attachment.parsedContent) {
				if (attachment.contentType === 'text/html') {
					const urlAttachmentContent = urlAttachmentTemplate(
						attachment.name,
						attachment.parsedContent
					);
					textAttachmentMessages.push({
						...ProtocolMessage.defaultValues(),
						role: 'user',
						content: urlAttachmentContent
					});
				} else if (attachment.contentType.includes('text')) {
					const textAttachmentContent = textAttachmentTemplate(
						attachment.name,
						attachment.parsedContent
					);
					textAttachmentMessages.push({
						...ProtocolMessage.defaultValues(),
						role: 'user',
						content: textAttachmentContent
					});
				} else if (attachment.contentType.includes('image')) {
					const [filename, parsedImageDescription] = attachment.parsedContent.split('***');
					const imageAttachmentContent = imageVisionAttachmentTemplate(
						filename,
						parsedImageDescription
					);
					imageAttachmentMessages.push({
						...ProtocolMessage.defaultValues(),
						role: 'user',
						content: imageAttachmentContent
					});
				}
			}
		});

		const modifiedQuery: QueryRequest = {
			...queryRequest,
			query: [
				...queryRequest.query.slice(0, -1),
				...textAttachmentMessages,
				...imageAttachmentMessages,
				lastMessage
			]
		};

		return modifiedQuery;
	}

	/**
	 * Concatenate consecutive messages from the same author into a single message.
	 * This is useful for LLMs that require role alternation between user and bot messages.
	 *
	 * @param protocolMessages - The messages to make alternated.
	 * @returns The modified messages.
	 */
	makePromptAuthorRoleAlternated(protocolMessages: ProtocolMessage[]): ProtocolMessage[] {
		const newMessages: ProtocolMessage[] = [];

		protocolMessages.forEach((protocolMessage, index) => {
			if (
				newMessages.length > 0 &&
				protocolMessage.role === newMessages[newMessages.length - 1].role
			) {
				const prevMessage = newMessages.pop()!;
				const newContent = `${prevMessage.content}\n\n${protocolMessage.content}`;

				const newAttachments: Attachment[] = [];
				const addedAttachmentUrls = new Set<string>();

				// Combine and deduplicate attachments from both messages
				[...(prevMessage.attachments || []), ...(protocolMessage.attachments || [])].forEach(
					(attachment) => {
						if (!addedAttachmentUrls.has(attachment.url)) {
							addedAttachmentUrls.add(attachment.url);
							newAttachments.push(attachment);
						}
					}
				);

				newMessages.push({
					...ProtocolMessage.defaultValues(),
					role: prevMessage.role,
					content: newContent,
					attachments: newAttachments
				});
			} else {
				newMessages.push(protocolMessage);
			}
		});

		return newMessages;
	}
	// Server-Sent Event helpers

	static textEvent(text: string): ServerSentEvent {
		return { data: JSON.stringify({ text }), event: 'text' };
	}

	static replaceResponseEvent(text: string): ServerSentEvent {
		return { data: JSON.stringify({ text }), event: 'replace_response' };
	}

	static doneEvent(): ServerSentEvent {
		return { data: '{}', event: 'done' };
	}

	static suggestedReplyEvent(text: string): ServerSentEvent {
		return { data: JSON.stringify({ text }), event: 'suggested_reply' };
	}

	static metaEvent(options: {
		contentType?: ContentType;
		refetchSettings?: boolean;
		linkify?: boolean;
		suggestedReplies?: boolean;
	}): ServerSentEvent {
		const {
			contentType = 'text/markdown',
			refetchSettings = false,
			linkify = true,
			suggestedReplies = false
		} = options;
		return {
			data: JSON.stringify({
				content_type: contentType,
				refetch_settings: refetchSettings,
				linkify: linkify,
				suggested_replies: suggestedReplies
			}),
			event: 'meta'
		};
	}

	static errorEvent(
		text: string,
		options: {
			allowRetry?: boolean;
			errorType?: string;
		}
	): ServerSentEvent {
		const { allowRetry = true, errorType } = options;
		const data: { [key: string]: boolean | string } = { allowRetry };
		if (text) data.text = text;
		if (errorType) data.errorType = errorType;
		return { data: JSON.stringify(modelDump(data)), event: 'error' };
	}

	// Internal handlers

	async handleReportFeedback(
		feedbackRequest: ReportFeedbackRequest,
		context: RequestContext
	): Promise<unknown> {
		await this.onFeedbackWithContext(feedbackRequest, context);
		return {};
	}

	async handleReportError(
		errorRequest: ReportErrorRequest,
		context: RequestContext
	): Promise<unknown> {
		await this.onErrorWithContext(errorRequest, context);
		return {};
	}

	async handleSettings(
		settingsRequest: SettingsRequest,
		context: RequestContext
	): Promise<unknown> {
		const settings = await this.getSettingsWithContext(settingsRequest, context);
		return settings;
	}

	async *handleQuery(
		request: QueryRequest,
		context: RequestContext
	): AsyncIterable<ServerSentEvent> {
		try {
			if (this.shouldInsertAttachmentMessages) {
				request = this.insertAttachmentMessages(request);
			} else if (this.concatAttachmentsToMessage) {
				logger.warn(
					'concatAttachmentsToMessage is deprecated. Use shouldInsertAttachmentMessages instead.'
				);
				request = this.concatAttachmentContentToMessageBody(request);
			}

			for await (const event of this.getResponseWithContext(request, context)) {
				if (isEventMessage(event)) {
					yield event;
				} else if (isErrorMessage(event)) {
					const errorResponse = event as ErrorResponse;
					yield PoeBot.errorEvent(errorResponse.text, {
						allowRetry: errorResponse.allowRetry,
						errorType: errorResponse.errorType
					});
				} else if (isMetaMessage(event)) {
					const metaResponse = event as MetaResponse;
					yield PoeBot.metaEvent({
						contentType: metaResponse.contentType,
						refetchSettings: metaResponse.refetchSettings,
						linkify: metaResponse.linkify,
						suggestedReplies: metaResponse.suggestedReplies
					});
				} else if (isPartialMessage(event)) {
					if (event.isSuggestedReply) {
						yield PoeBot.suggestedReplyEvent(event.text);
					} else if (event.isReplaceResponse) {
						yield PoeBot.replaceResponseEvent(event.text);
					} else {
						yield PoeBot.textEvent(event.text);
					}
				}
			}
		} catch (error) {
			logger.error('Error responding to query:', error);
			yield PoeBot.errorEvent((error as Error).message, { allowRetry: false });
		}

		try {
			await this.processPendingAttachmentRequests(request.messageId);
		} catch (error) {
			logger.error('Error processing pending attachment requests');
			yield PoeBot.errorEvent((error as Error).message, { allowRetry: false });
		}

		yield PoeBot.doneEvent();
	}
}
