/* eslint-disable @typescript-eslint/no-explicit-any */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	NONE = 4 // No logging
}

export interface Logger {
	debug(message?: any, ...optionalParams: any[]): void;
	info(message?: any, ...optionalParams: any[]): void;
	warn(message?: any, ...optionalParams: any[]): void;
	error(message?: any, ...optionalParams: any[]): void;
	setLevel(level: LogLevel): void;
}

export class DefaultLogger implements Logger {
	private level: LogLevel = LogLevel.INFO;

	debug(message?: any, ...optionalParams: any[]): void {
		if (this.level <= LogLevel.DEBUG) {
			console.debug(message, ...optionalParams);
		}
	}

	info(message?: any, ...optionalParams: any[]): void {
		if (this.level <= LogLevel.INFO) {
			console.info(message, ...optionalParams);
		}
	}

	warn(message?: any, ...optionalParams: any[]): void {
		if (this.level <= LogLevel.WARN) {
			console.warn(message, ...optionalParams);
		}
	}

	error(message?: any, ...optionalParams: any[]): void {
		if (this.level <= LogLevel.ERROR) {
			console.error(message, ...optionalParams);
		}
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}
}

export let logger: Logger = new DefaultLogger();

export function setLogger(newLogger: Logger): void {
	logger = newLogger;
}

export function setLogLevel(level: LogLevel): void {
	logger.setLevel(level);
}
