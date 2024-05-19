/* eslint-disable @typescript-eslint/no-unused-vars */
import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';

import { HTTPException, InvalidParameterError, PoeBot } from './base';
import EventEmitter from 'events';
import { logger } from './logger';
import { encodeServerSentEvent, type ServerSentEvent } from './sse';
import type { JsonMap } from './internal/types';
import { modelDump, parseObj } from './internal/utils';

import type {
	QueryRequest,
	ReportErrorRequest,
	ReportFeedbackRequest,
	SettingsRequest
} from './types';

export class ExpressEventSourceResponse {
	private static readonly DEFAULT_PING_INTERVAL = 15;
	private static readonly DEFAULT_SEPARATOR = '\r\n';

	private bodyIterator: AsyncIterable<ServerSentEvent>;
	private statusCode: number;
	private mediaType: string;
	private headers: Record<string, string>;
	private pingInterval: number;
	private sep: string;
	private pingMessageFactory?: () => ServerSentEvent;
	private dataSenderCallable?: () => Promise<void>;
	private sendTimeout?: number;
	private active: boolean;

	constructor(
		content: AsyncIterable<ServerSentEvent>,
		options: {
			status?: number;
			headers?: Record<string, string>;
			mediaType?: string;
			ping?: number;
			sep?: string;
			pingMessageFactory?: () => ServerSentEvent;
			dataSenderCallable?: () => Promise<void>;
			sendTimeout?: number;
		} = {}
	) {
		if (options.sep && !['\\r\\n', '\\r', '\\n'].includes(options.sep)) {
			throw new InvalidParameterError(`sep must be one of: \\r\\n, \\r, \\n, got: ${options.sep}`);
		}

		this.bodyIterator = content;
		this.statusCode = options.status || 200;
		this.mediaType = options.mediaType || 'text/event-stream';

		// mandatory for servers-sent events headers
		// allow cache control header to be set by user to support fan out proxies
		// https://www.fastly.com/blog/server-sent-events-fastly
		this.headers = {
			'Content-Type': this.mediaType,
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
			...options.headers
		};
		this.pingInterval = options.ping || ExpressEventSourceResponse.DEFAULT_PING_INTERVAL;
		this.sep = options.sep || ExpressEventSourceResponse.DEFAULT_SEPARATOR;
		this.pingMessageFactory = options.pingMessageFactory;
		this.dataSenderCallable = options.dataSenderCallable;
		this.sendTimeout = options.sendTimeout;
		this.active = true;
	}

	private writeTimeout(res: Response) {
		const timeoutChunk = encodeServerSentEvent(
			{
				event: 'error',
				data: JSON.stringify({ text: 'error sse write timeout', allow_retry: false })
			},
			'',
			this.sep
		);
		res.write(timeoutChunk);
		logger.debug(`<-- RESP_STREAM: ${timeoutChunk.toString()}`);
	}

	private async streamResponse(res: Response): Promise<void> {
		if (this.active) {
			res.set(this.headers);
			res.status(this.statusCode);

			logger.info(`<-- RESP_STATUS: ${this.statusCode}`);
			logger.debug(`<-- RESP_HEADERS: ${JSON.stringify(this.headers)}`);

			let timeout = null;
			let interrupted = false;
			for await (const data of this.bodyIterator) {
				if (interrupted || !this.active) {
					break;
				}
				if (timeout !== null) {
					clearTimeout(timeout);
				}

				if (this.sendTimeout) {
					timeout = setTimeout(() => {
						interrupted = true;
					}, this.sendTimeout);
				}

				const chunk = encodeServerSentEvent(data, '', this.sep);

				res.write(chunk);
				logger.debug(`<-- RESP_STREAM: ${chunk.toString()}`);
			}
			if (this.active) {
				this.active = false;
				if (timeout !== null) {
					clearTimeout(timeout);
				}
				if (interrupted) {
					this.writeTimeout(res);
				}
				res.end();
			}
		}
	}

	private async ping(res: Response): Promise<void> {
		while (this.active) {
			await new Promise((resolve) => setTimeout(resolve, this.pingInterval * 1000));

			if (this.active) {
				const ping = this.pingMessageFactory
					? encodeServerSentEvent(this.pingMessageFactory())
					: encodeServerSentEvent({}, `ping - ${new Date().toISOString()}`, this.sep);
				res.write(ping);
				logger.debug(`<-- RESP_STREAM: ${ping.toString()}`);
			}
		}
	}

	async handleRequest(req: Request, res: Response): Promise<void> {
		const events = new EventEmitter();

		req.on('close', () => {
			logger.debug('Got event: close. Stop streaming...');
			//events.emit('close');
		});

		const closeHandler = () => {
			logger.debug('Got SIGTERM signal. Stop streaming.');
			events.emit('close');
		};

		process.on('SIGTERM', closeHandler);

		const tasks = [
			this.streamResponse(res),
			this.ping(res),
			new Promise((resolve) => events.once('close', resolve))
		];

		if (this.dataSenderCallable) {
			tasks.push(this.dataSenderCallable());
		}

		await Promise.race(tasks);

		process.off('SIGTERM', closeHandler);

		if (this.active) {
			this.active = false;
			this.writeTimeout(res);
			res.end();
		}
	}
}

interface HTTPAuthorizationCredentials {
	scheme: string;
	credentials: string;
}

function extractAuthorization(req: Request): HTTPAuthorizationCredentials {
	const authorization = req.headers.authorization;
	const [scheme, credentials] = authorization ? authorization.split(' ') : [null, null];
	if (!authorization || !scheme || !credentials) {
		throw new HTTPException(403, 'Not authenticated');
	}
	if (scheme.toLowerCase() !== 'bearer') {
		throw new HTTPException(403, 'Invalid authorization credentials');
	}
	return { scheme, credentials };
}

/**
 * Figures out the access key.
 *
 * The order of preference is:
 * 1) options.accessKey parameter
 * 2) POE_ACCESS_KEY environment variable
 * 3) apiKey parameter
 * 4) POE_API_KEY environment variable
 *
 * @param options.accessKey The preferred access key explicitly passed.
 * @param options.apiKey The API key which is deprecated for access purposes.
 * @returns The determined access key or null if none is found.
 */
function findAccessKey({
	accessKey,
	apiKey
}: {
	accessKey?: string;
	apiKey?: string;
}): string | null {
	if (accessKey) {
		return accessKey;
	}

	const environPoeAccessKey = process.env.POE_ACCESS_KEY;
	if (environPoeAccessKey) {
		return environPoeAccessKey;
	}

	if (apiKey) {
		logger.warn('usage of apiKey is deprecated, pass your key using accessKey instead');
		return apiKey;
	}

	const environPoeApiKey = process.env.POE_API_KEY;
	if (environPoeApiKey) {
		logger.warn('usage of POE_API_KEY is deprecated, pass your key using POE_ACCESS_KEY instead');
		return environPoeApiKey;
	}

	return null;
}

/**
 * Checks whether we have a valid access key and returns it.
 *
 * @param accessKey The preferred access key explicitly passed.
 * @param apiKey The API key which is deprecated for access purposes.
 * @param allowWithoutKey Whether to allow operations without a key.
 * @returns The valid access key or null if allowed without a key.
 */
function verifyAccessKey({
	accessKey,
	apiKey,
	allowWithoutKey = false
}: {
	accessKey: string;
	apiKey: string;
	allowWithoutKey?: boolean;
}): string | null {
	const resolvedAccessKey = findAccessKey({ accessKey: accessKey, apiKey: apiKey });
	if (!resolvedAccessKey) {
		if (allowWithoutKey) {
			return null;
		}
		throw new InvalidParameterError(
			'Please provide an access key.\n' +
				'You can get a key from the create_bot page at: https://poe.com/create_bot?server=1\n' +
				'You can then pass the key using the accessKey parameter to the run() or makeApp() ' +
				'functions, or by using the POE_ACCESS_KEY environment variable.'
		);
	}
	if (resolvedAccessKey.length !== 32) {
		throw new InvalidParameterError('Invalid access key (should be 32 characters)');
	}
	return resolvedAccessKey;
}

function addRoutesForBot(app: express.Application, bot: PoeBot): void {
	app.get(bot.path, async (req: Request, res: Response) => {
		const url = 'https://poe.com/create_bot?server=1';
		res.send(
			`<html><body><h1>Express Poe bot server</h1><p>Congratulations! Your server is running. To connect it to Poe, create a bot at <a href="${url}">${url}</a>.</p></body></html>`
		);
	});

	app.post(bot.path, async (req: Request, res: Response, next: NextFunction) => {
		if (!bot.accessKey) {
			next();
		} else {
			const { scheme, credentials } = extractAuthorization(req);
			if (scheme !== 'Bearer' || credentials !== bot.accessKey) {
				throw new HTTPException(401, 'Invalid access key', undefined, {
					'WWW-Authenticate': 'Bearer'
				});
			}
			next();
		}
	});

	app.post(bot.path, async (req: Request, res: Response) => {
		logger.info(`--> REQ: ${req.method} ${req.originalUrl}`);
		logger.debug(`--> REQ_HEADERS: ${req.headers ? JSON.stringify(req.headers) : ''}`);
		logger.debug(`--> REQ_BODY: ${req.body ? JSON.stringify(req.body) : ''}`);

		const requestBody = req.body;

		//requestBody.httpRequest = req; // Storing the HTTP request inside the body, if needed
		if (requestBody.type === 'query') {
			const queryReq = {
				...(parseObj(requestBody) as JsonMap),
				accessKey: bot.accessKey || '<missing>',
				apiKey: bot.accessKey || '<missing>'
			} as QueryRequest;
			const eventSourceResponse = new ExpressEventSourceResponse(
				bot.handleQuery(queryReq, { httpRequest: req })
			);
			await eventSourceResponse.handleRequest(req, res);
		} else if (requestBody.type === 'settings') {
			const settingReq = {
				...(parseObj(requestBody) as JsonMap)
			} as unknown as SettingsRequest;
			const settingsResponse = await bot.handleSettings(settingReq, { httpRequest: req });
			const respBody = modelDump(settingsResponse, false);
			res.json(respBody);
			logger.debug(`<-- Response body: ${JSON.stringify(respBody)}`);
		} else if (requestBody.type === 'report_feedback') {
			const feedbackReq = {
				...(parseObj(requestBody) as JsonMap)
			} as unknown as ReportFeedbackRequest;
			const feedbackResponse = await bot.handleReportFeedback(feedbackReq, { httpRequest: req });
			const respBody = modelDump(feedbackResponse);
			res.json(respBody);
			logger.debug(`<-- Response body: ${JSON.stringify(respBody)}`);
		} else if (requestBody.type === 'report_error') {
			const errorReq = {
				...(parseObj(requestBody) as JsonMap)
			} as unknown as ReportErrorRequest;
			const errorResponse = await bot.handleReportError(errorReq, { httpRequest: req });
			const respBody = modelDump(errorResponse);
			res.json(respBody);
			logger.debug(`<-- Response body: ${JSON.stringify(respBody)}`);
		} else {
			throw new HTTPException(501, 'Unsupported request type');
		}
	});
}

/**
 * Creates an Express.js application configured to serve one or more bots.
 *
 * @param bot A single PoeBot instance or an array of PoeBot instances.
 * @param accessKey The access key to use. If not provided, the server tries to
 * read the POE_ACCESS_KEY environment variable. If that is not set, the server will
 * refuse to start unless `allowWithoutKey` is true. If multiple bots are provided,
 * the access key must be provided as part of the bot object.
 * @param apiKey The API key to use, similar in usage to `accessKey`.
 * @param allowWithoutKey If true, the server will start even if no access key is provided.
 * Requests will not be checked against any key. If an access key is provided, it
 * is still checked.
 * @param app An existing Express app instance. If provided, the app will be configured
 * with the provided bots, access keys, and other settings. If not provided, a new Express
 * application instance will be created and configured.
 * @returns An Express.js app configured to serve the specified bot(s).
 */
export function makeApp(
	bot: PoeBot | PoeBot[],
	accessKey: string = '',
	options: { apiKey?: string; allowWithoutKey?: boolean; app?: Express } = {}
): Express {
	const { apiKey = '', allowWithoutKey = false, app = express() } = options;

	app.use(express.json());

	app.use((error: Error, req: Request, res: Response, next: express.NextFunction) => {
		if (error instanceof HTTPException) {
			res.status(error.statusCode).send(error.message);
		} else {
			logger.error('Internal server error', error);
			res.status(500).send('Internal server error');
		}
	});

	let bots: PoeBot[];
	if (!Array.isArray(bot)) {
		if (!bot.accessKey) {
			bot.accessKey = verifyAccessKey({ accessKey, apiKey, allowWithoutKey });
		} else if (accessKey) {
			throw new InvalidParameterError(
				'Cannot provide accessKey if the bot object already has an access key'
			);
		} else if (apiKey) {
			throw new InvalidParameterError(
				'Cannot provide apiKey if the bot object already has an access key'
			);
		}
		bots = [bot];
	} else {
		if (accessKey || apiKey) {
			throw new InvalidParameterError(
				'When serving multiple bots, the access_key must be set on each bot'
			);
		}
		bots = bot;
	}

	// Ensure paths are unique
	const pathToBots = new Map<string, PoeBot>();
	bots.forEach((bot) => {
		if (pathToBots.has(bot.path)) {
			throw new InvalidParameterError(
				`Multiple bots are trying to use the same path: ${bot.path}. `
			);
		}
		pathToBots.set(bot.path, bot);
	});

	bots.forEach((bot) => {
		if (!bot.accessKey && !allowWithoutKey) {
			throw new InvalidParameterError(`Missing access key for bot at path ${bot.path}`);
		}
	});

	bots.forEach((bot) => {
		addRoutesForBot(app, bot);
	});

	return app;
}
