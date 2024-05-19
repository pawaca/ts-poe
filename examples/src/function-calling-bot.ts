/**
 * Sample bot that demonstrates how to use OpenAI function calling with the Poe API.
 */

import { PoeBot } from 'ts-poe/base';
import { streamRequest, type AsyncResult } from 'ts-poe/client';
import {
	SettingsResponse,
	type PartialResponse,
	type QueryRequest,
	type ToolDefinition
} from 'ts-poe/types';

async function* getCurrentWeather(options: {
	location: string;
	unit?: string;
}): AsyncIterable<PartialResponse | AsyncResult> {
	const { location, unit = 'celsius' } = options;
	let response = {};
	if (location.toLowerCase().includes('tokyo')) {
		response = { location: 'Tokyo', temperature: '11', unit: unit };
	} else if (location.toLowerCase().includes('san francisco')) {
		response = { location: 'San Francisco', temperature: '72', unit: unit };
	} else if (location.toLowerCase().includes('paris')) {
		response = { location: 'Paris', temperature: '22', unit: unit };
	} else {
		response = { location: location, temperature: 'unknown', unit: unit };
	}
	yield { result: JSON.stringify(response) } as AsyncResult;
}

const toolsDictList = [
	{
		type: 'function',
		function: {
			name: 'get_current_weather',
			description: 'Get the current weather in a given location',
			parameters: {
				type: 'object',
				properties: {
					location: {
						type: 'string',
						description: 'The city and state, e.g. San Francisco, CA'
					},
					unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
				},
				required: ['location']
			}
		}
	}
];

const tools = toolsDictList.map((toolsDict) => toolsDict as ToolDefinition);
const toolsExecutables = [getCurrentWeather];

export class GPT35FunctionCallingBot extends PoeBot {
	protected async *getResponse(request: QueryRequest): AsyncIterable<PartialResponse> {
		for await (const msg of streamRequest(request, 'GPT-3.5-Turbo', request.accessKey, {
			tools: tools,
			toolExecutables: toolsExecutables
		})) {
			yield msg;
		}
	}

	protected async getSettings(): Promise<SettingsResponse> {
		return { ...SettingsResponse.defaultValues(), serverBotDependencies: { 'GPT-3.5-Turbo': 2 } };
	}
}
