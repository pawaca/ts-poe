import 'dotenv/config';
import type { Express } from 'express';
import type { PoeBot } from 'ts-poe/base';
import { makeApp } from 'ts-poe/express';
import { logger } from 'ts-poe/logger';
import { CatBot } from './catbot';
import { EchoBot } from './echobot';
import { GPT35FunctionCallingBot } from './function-calling-bot';
import { HttpRequestBot } from './http-request-bot';
import { HuggingFaceConversationalBot } from './huggingface-bot';
import { SampleImageResponseBot } from './image-response-bot';
import { LangchainOpenAIChatBot } from './langchain-openai-bot';
import { PDFSizeBot } from './pdf-counter-bot';
import { GPT35TurboAllCapsBot } from './turbo-allcaps-bot';
import { GPT35TurbovsClaudeBot } from './turbo-vs-claude-bot';
import { VideoBot } from './video-bot';

/**
 * Serve a PoeBot using an Express.js application. This function should be used when you are running
 * the bot locally.
 */
export function run(
	bot: PoeBot | PoeBot[],
	accessKey: string = '',
	options: {
		apiKey?: string;
		allowWithoutKey?: boolean;
		app?: Express;
	} = {}
): void {
	const appCurrent = makeApp(bot, accessKey, options);
	const port = parseInt(process.env.PORT || '9090');
	logger.info('Starting server...');
	const server = appCurrent.listen(port, async () => {
		logger.info(`Server listening on port ${port}`);
	});
	const gracefulShutdown = () => {
		console.log('Received kill signal, shutting down gracefully');
		server.close(() => {
			console.log('Closed out remaining connections');
			process.exit(0);
		});
		setTimeout(() => {
			console.error('Could not close connections in time, forcefully shutting down');
			process.exit(1);
		}, 10000);
	};
	process.on('SIGTERM', gracefulShutdown);
	process.on('SIGINT', gracefulShutdown);
}

// Optionally, provide your Poe access key here:
// 1. You can go to https://poe.com/create_bot?server=1 to generate an access key.
// 2. We strongly recommend using a key for a production bot to prevent abuse,
// but the starter examples disable the key check for convenience.

// const POE_ACCESS_KEY = "";
// run(bot, POE_ACCESS_KEY);

function bootstrap() {
	const POE_ACCESS_KEY = process.env.POE_ACCESS_KEY || '';
	const config = {
		'/cat': CatBot,
		'/echo': EchoBot,
		'/fc': GPT35FunctionCallingBot,
		'/http_req': HttpRequestBot,
		'/hf': HuggingFaceConversationalBot,
		'/image': SampleImageResponseBot,
		'/langchain': LangchainOpenAIChatBot,
		'/pdf': PDFSizeBot,
		'/caps': GPT35TurboAllCapsBot,
		'/combined': GPT35TurbovsClaudeBot,
		'/video': VideoBot
	};
	const bots = Object.entries(config).map(([path, Bot]) => new Bot(path, POE_ACCESS_KEY));
	run(bots);
}

bootstrap();
