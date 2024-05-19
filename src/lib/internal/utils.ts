import type { ServerSentEvent } from '../sse';
import type { AsyncResult } from '../client';
import type { ErrorResponse, MetaResponse, PartialResponse } from '../types';
import type { JsonMap, JsonValue } from './types';

export function camelToSnakeCase(str: string): string {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamelCase(str: string): string {
	return str.replace(/(_\w)/g, (m) => m[1].toUpperCase());
}

export function modelDump(obj: unknown, deepDump: boolean = true): JsonValue {
	if (obj === null || obj === undefined) {
		return null;
	}

	if (typeof obj !== 'object') {
		return obj as JsonValue;
	}

	if (Array.isArray(obj)) {
		return deepDump ? obj.map((item) => modelDump(item, deepDump)) : obj;
	}

	const result: JsonMap = {};
	Object.entries(obj as object).forEach(([key, value]) => {
		const snakeKey = camelToSnakeCase(key);
		result[snakeKey] = deepDump ? modelDump(value, deepDump) : value;
	});
	return result;
}

export function parseObj(obj: unknown): JsonValue {
	if (obj === null || obj === undefined) {
		return null;
	}

	if (typeof obj !== 'object') {
		return obj as JsonValue; // Primitive types are returned as-is
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => parseObj(item)); // Recursively parse array items
	}

	const result: JsonMap = {};
	Object.entries(obj as JsonMap).forEach(([key, value]) => {
		const camelKey = snakeToCamelCase(key);
		result[camelKey] = parseObj(value); // Recursively parse object properties
	});
	return result;
}

export function isBotErrorNoRetry(e: unknown): boolean {
	if (e instanceof Error && 'name' in e) {
		return e.name === 'BotErrorNoRetry';
	}
	return false;
}

export function isError(e: unknown): boolean {
	return e instanceof Error;
}

export function isAxiosError(e: unknown): boolean {
	return e instanceof Error && 'isAxiosError' in e;
}

export function isMetaMessage(message: unknown): message is MetaResponse {
	return message instanceof Object && 'suggestedReplies' in message;
}

export function isErrorMessage(message: unknown): message is ErrorResponse {
	return message instanceof Object && 'allowRetry' in message;
}

export function isPartialMessage(message: unknown): message is PartialResponse {
	return message instanceof Object && 'text' in message;
}

export function isEventMessage(message: unknown): message is ServerSentEvent {
	return message instanceof Object && 'event' in message;
}

export function isAsyncResult(message: unknown): message is AsyncResult {
	return message instanceof Object && 'result' in message;
}

export function safeEllipsis(obj: unknown, limit: number): string {
	if (typeof obj !== 'string') {
		obj = JSON.stringify(obj);
	}
	let value = obj as string;
	if (value.length > limit) {
		value = value.slice(0, limit - 3) + '...';
	}
	return value;
}
