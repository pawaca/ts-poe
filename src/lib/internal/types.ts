export type JsonValue = string | number | boolean | null | JsonArray | JsonMap;

export interface JsonMap {
	[key: string]: JsonValue;
}

export interface JsonArray extends Array<JsonValue> {}
