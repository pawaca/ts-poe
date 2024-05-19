/* eslint-disable @typescript-eslint/no-namespace */
export type Identifier = string;

export type FeedbackType = 'like' | 'dislike';

export type ContentType = 'text/markdown' | 'text/plain';

export type ErrorType = 'user_message_too_long';

/**
 * Feedback for a message as used in the Poe protocol.
 *
 * #### Fields:
 * - `type` (`FeedbackType`): The type of feedback.
 * - `reason` (`string | undefined`): Optional reason for the feedback.
 */
export interface MessageFeedback {
	type: FeedbackType;
	reason?: string;
}

/**
 * Attachment included in a protocol message.
 *
 * #### Fields:
 * - `url` (`string`): The URL of the attachment.
 * - `contentType` (`string`): The MIME type of the attachment.
 * - `name` (`string`): The name of the attachment.
 * - `parsedContent` (`string | undefined` = undefined): Optional, the parsed content of the attachment.
 */
export interface Attachment {
	url: string;
	contentType: string;
	name: string;
	parsedContent?: string;
}

/**
 * A message as used in the Poe protocol.
 *
 * #### Fields:
 * - `role` (`"system" | "user" | "bot"`): The role of the message sender.
 * - `senderId` (`string | undefined`): The ID of the sender, if any.
 * - `content` (`string`): The content of the message.
 * - `contentType` (`ContentType = "text/markdown"`): The type of content, defaults to "text/markdown".
 * - `timestamp` (`number = 0`): The timestamp of the message, default is 0.
 * - `messageId` (`string = ""`): Unique identifier for the message, default is an empty string.
 * - `feedback` (`MessageFeedback[] = []`): List of feedbacks associated with the message, default is an empty array.
 * - `attachments` (`Attachment[] = []`): List of attachments included in the message, default is an empty array.
 */
export interface ProtocolMessage {
	role: 'system' | 'user' | 'bot';
	senderId?: string;
	content: string;
	contentType: ContentType;
	timestamp: number;
	messageId: string;
	feedback: MessageFeedback[];
	attachments: Attachment[];
}

export namespace ProtocolMessage {
	export function defaultValues() {
		return {
			contentType: 'text/markdown' as ContentType,
			timestamp: 0,
			messageId: '',
			feedback: [],
			attachments: []
		};
	}
}

export interface RequestContext {
	httpRequest: unknown;
}

export namespace ResponseContext {
	export interface Config {
		arbitraryTypesAllowed: boolean;
	}
}

export namespace RequestContext {
	export interface Config {
		arbitraryTypesAllowed: boolean;
	}
}

/**
 * Common data for all requests.
 */
export interface BaseRequest {
	version: string;
	type: 'query' | 'settings' | 'report_feedback' | 'report_error';
}

/**
 * Request parameters for a query request.
 *
 * #### Fields:
 * - `query` (`ProtocolMessage[]`): List of messages representing the current state of the chat.
 * - `userId` (`Identifier`): An anonymized identifier representing a user. This is persistent
 *   for subsequent requests from that user.
 * - `conversationId` (`Identifier`): An identifier representing a chat. This is
 *   persistent for subsequent requests for that chat.
 * - `messageId` (`Identifier`): An identifier representing a message.
 * - `accessKey` (`string = "<missing>"`): Contains the access key defined when you created your bot
 *   on Poe.
 * - `temperature` (`number = 0.7`): Temperature input to be used for model inference.
 * - `skipSystemPrompt` (`boolean = false`): Whether to use any system prompting or not.
 * - `logitBias` (`{ [key: string]: number } = {}`): Logit biases to adjust model behavior.
 * - `stopSequences` (`string[] = []`): Sequences where the model should stop generating further content.
 */
export interface QueryRequest extends BaseRequest {
	type: 'query';
	query: ProtocolMessage[];
	userId: Identifier;
	conversationId: Identifier;
	messageId: Identifier;
	metadata: Identifier;
	apiKey: string;
	accessKey: string;
	temperature: number;
	skipSystemPrompt: boolean;
	logitBias: {
		[key: string]: number;
	};
	stopSequences: string[];
}

export namespace QueryRequest {
	export function defaultValues() {
		return {
			metadata: '',
			accessKey: '<missing>',
			apiKey: '<missing>',
			temperature: 0.7,
			skipSystemPrompt: false,
			logitBias: {},
			stopSequences: []
		};
	}
}

/**
 * Request parameters for a settings request. Currently, this contains no fields but this might get updated in the future.
 */
export interface SettingsRequest extends BaseRequest {
	type: 'settings';
}

/**
 * Request parameters for a report_feedback request.
 *
 * #### Fields:
 * - `messageId` (`Identifier`): An identifier representing a message.
 * - `userId` (`Identifier`): An anonymized identifier representing a user.
 * - `conversationId` (`Identifier`): An identifier representing a chat.
 * - `feedbackType` (`FeedbackType`): The type of feedback being reported.
 */
export interface ReportFeedbackRequest extends BaseRequest {
	type: 'report_feedback';
	messageId: Identifier;
	userId: Identifier;
	conversationId: Identifier;
	feedbackType: FeedbackType;
}

/**
 * Request parameters for a report_error request.
 *
 * #### Fields:
 * - `message` (`string`): A description or message detailing the error.
 * - `metadata` (`{ [key: string]: unknown }`): A dictionary containing additional information about the error.
 */
export interface ReportErrorRequest extends BaseRequest {
	type: 'report_error';
	message: string;
	metadata: {
		[key: string]: unknown;
	};
}

/**
 * An object representing your bot's response to a settings object.
 *
 * #### Fields:
 * - `serverBotDependencies` (`{ [key: string]: number } = {}`): Information about other bots that your bot
 *   uses. This is used to facilitate the Bot Query API.
 * - `allowAttachments` (`boolean = false`): Whether to allow users to upload attachments to your
 *   bot.
 * - `introductionMessage` (`string = ""`): The introduction message to display to the users of your
 *   bot.
 * - `expandTextAttachments` (`boolean = true`): Whether to request parsed content/descriptions from
 *   text attachments with the query request. This content is sent through the new parsed_content
 *   field in the attachment dictionary. This change makes enabling file uploads much simpler.
 * - `enableImageComprehension` (`boolean = false`): Similar to `expand_text_attachments` but for
 *   images.
 * - `enforceAuthorRoleAlternation` (`boolean = false`): If enabled, Poe will concatenate messages
 *   so that they follow role alternation, which is a requirement for certain LLM providers like
 *   Anthropic.
 * - `enableMultiBotChatPrompting` (`boolean = false`): If enabled, Poe will combine previous bot
 *   messages if there is a multibot context.
 */
export interface SettingsResponse {
	serverBotDependencies: {
		[key: string]: number;
	};
	allowAttachments: boolean;
	introductionMessage: string;
	expandTextAttachments: boolean;
	enableImageComprehension: boolean;
	enforceAuthorRoleAlternation: boolean;
	enableMultiBotChatPrompting: boolean;
	contextClearWindowSecs?: number; //deprecated
	allowUserContextClear?: boolean; //deprecated
}

export namespace SettingsResponse {
	export function defaultValues() {
		return {
			serverBotDependencies: {},
			allowAttachments: false,
			introductionMessage: '',
			expandTextAttachments: true,
			enableImageComprehension: false,
			enforceAuthorRoleAlternation: false,
			enableMultiBotChatPrompting: false,
			allowUserContextClear: true
		};
	}
}

export interface AttachmentUploadResponse {
	inlineRef?: string;
	attachmentUrl?: string;
}

/**
 * Representation of a (possibly partial) response from a bot. Yield this in
 * `PoeBot.get_response` or `PoeBot.get_response_with_context` to communicate your response to Poe.
 *
 * #### Fields:
 * - `text` (`string`): The actual text you want to display to the user. Note that this should solely
 *   be the text in the next token since Poe will automatically concatenate all tokens before
 *   displaying the response to the user.
 * - `data` (`{[key: string]: unknown} | null`): Used to send arbitrary JSON data to Poe. This is
 *   currently only used for OpenAI function calling.
 * - `isSuggestedReply` (`boolean = false`): Setting this to true will create a suggested reply with
 *   the provided text value.
 * - `isReplaceResponse` (`boolean = false`): Setting this to true will clear out the previously
 *   displayed text to the user and replace it with the provided text value.
 */
export interface PartialResponse {
	/**
	 * Partial response text.
	 *
	 * If the final bot response is "ABC", you may see a sequence
	 * of PartialResponse objects like PartialResponse(text="A"),
	 * PartialResponse(text="B"), PartialResponse(text="C").
	 */
	text: string;
	/**
	 * Used when a bot returns the json event.
	 */
	data?: {
		[key: string]: unknown;
	};
	/**
	 * For debugging, the raw response from the bot.
	 */
	rawResponse?: unknown;
	/**
	 * For debugging, contains the full prompt as sent to the bot.
	 */
	fullPrompt?: string;
	/**
	 * May be set to an internal identifier for the request.
	 */
	requestId?: string;
	/**
	 * If true, this is a suggested reply.
	 */
	isSuggestedReply: boolean;
	/**
	 * If true, this text should completely replace the previous bot text.
	 */
	isReplaceResponse: boolean;
}

export namespace PartialResponse {
	export function defaultValues() {
		return {
			isSuggestedReply: false,
			isReplaceResponse: false
		};
	}
}

/**
 * Similar to `PartialResponse`. Yield this to communicate errors from your bot.
 *
 * #### Fields:
 * - `allowRetry` (`boolean = false`): Whether or not to allow a user to retry on error.
 * - `errorType` (`ErrorType | null = null`): An enum indicating what error to display.
 */
export interface ErrorResponse extends PartialResponse {
	allowRetry: boolean;
	errorType?: ErrorType;
}

export namespace ErrorResponse {
	export function defaultValues() {
		return { ...PartialResponse.defaultValues(), allowRetry: false };
	}
}

/**
 * Similar to `PartialResponse`. Yield this to communicate `meta` events from server bots.
 *
 * #### Fields:
 * - `suggestedReplies` (`boolean = false`): Whether or not to enable suggested replies.
 * - `contentType` (`ContentType = "text/markdown"`): Used to describe the format of the response.
 *   The currently supported values are `text/plain` and `text/markdown`.
 * - `refetchSettings` (`boolean = false`): Used to trigger a settings fetch request from Poe. A more
 *   robust way to trigger this is documented at:
 *   https://creator.poe.com/docs/server-bots-functional-guides#updating-bot-settings
 */
export interface MetaResponse extends PartialResponse {
	linkify: boolean;
	suggestedReplies: boolean;
	contentType: ContentType;
	refetchSettings: boolean;
}

export namespace MetaResponse {
	export function defaultValues() {
		return {
			...PartialResponse.defaultValues(),
			linkify: true, //deprecated
			suggestedReplies: true,
			contentType: 'text/markdown',
			refetchSettings: false
		};
	}
}

/**
 * An object representing a tool definition used for OpenAI function calling.
 * #### Fields:
 * - `type` (`string`)
 * - `function` (`FunctionDefinition`): Look at the source code for a detailed description
 *   of what this means.
 */
export interface ToolDefinition {
	type: string;
	function: ToolDefinition.FunctionDefinition;
}

export namespace ToolDefinition {
	export interface FunctionDefinition {
		name: string;
		description: string;
		parameters: FunctionDefinition.ParametersDefinition;
	}
	export namespace FunctionDefinition {
		export interface ParametersDefinition {
			type: string;
			properties: {
				[key: string]: unknown;
			};
			required?: string[];
		}
	}
}

/**
 * An object representing a tool call. This is returned as a response by the model when using
 * OpenAI function calling.
 * #### Fields:
 * - `id` (`string`)
 * - `type` (`string`)
 * - `function` (`FunctionDefinition`): Look at the source code for a detailed description
 *   of what this means.
 */
export interface ToolCallDefinition {
	id: string;
	type: string;
	function: ToolCallDefinition.FunctionDefinition;
}

export namespace ToolCallDefinition {
	export interface FunctionDefinition {
		name: string;
		arguments: string;
	}
}

/**
 * An object representing a function result. This is passed to the model in the last step
 * when using OpenAI function calling.
 * #### Fields:
 * - `role` (`string`)
 * - `name` (`string`)
 * - `toolCallId` (`string`)
 * - `content` (`string`)
 */
export interface ToolResultDefinition {
	role: string;
	name: string;
	toolCallId: string;
	content: string;
}
