import { getBotResponse, type AsyncResult } from '$lib/client';
import { ProtocolMessage, type PartialResponse, type ToolDefinition } from '$lib/types';
import { expect, test } from 'vitest';
import 'dotenv/config';

test('getBotResponse should return a response from the bot', async () => {
	const apiKey = process.env.POE_API_KEY ?? '';
	let done = false;
	for await (const partial of getBotResponse(
		[{ ...ProtocolMessage.defaultValues(), role: 'user', content: 'Hello' }],
		'GPT-3.5-Turbo',
		apiKey
	)) {
		console.log(partial.text);
		done = true;
	}
	expect(done).toBe(true);
});

test('getBotResponse should call tool and return a response from the bot', async () => {
	const tool: ToolDefinition = {
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
	};
	const executable = async function* getCurrentWeather(options: {
		location: string;
		unit: string;
	}): AsyncIterable<PartialResponse | AsyncResult> {
		const { location, unit = 'fahrenheit' } = options;
		const lcLocation = location.toLowerCase();
		if (lcLocation.includes('tokyo')) {
			yield { result: JSON.stringify({ location: 'Tokyo', temperature: '11', unit: unit }) };
		} else if (lcLocation.includes('san francisco')) {
			yield {
				result: JSON.stringify({ location: 'San Francisco', temperature: '72', unit: unit })
			};
		} else if (lcLocation.includes('paris')) {
			yield { result: JSON.stringify({ location: 'Paris', temperature: '22', unit: unit }) };
		} else {
			yield { result: JSON.stringify({ location: location, temperature: 'unknown' }) };
		}
	};
	const apiKey = process.env.POE_API_KEY ?? '';
	let done = false;

	for await (const partial of getBotResponse(
		[{ ...ProtocolMessage.defaultValues(), role: 'user', content: '东京的温度' }],
		'GPT-3.5-Turbo',
		apiKey,
		{
			tools: [tool],
			toolExecutables: [executable]
		}
	)) {
		console.log(partial.text);
		done = true;
	}
	expect(done).toBe(true);
});
