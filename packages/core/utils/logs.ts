import { LogEntry, Metadata } from "@superglue/shared";
import EventEmitter from "events";
import { pino } from "pino";

const levelMap: Record<number, 'info' | 'error' | 'warn' | 'debug'> = {
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error'
};

// Single event emitter instance for all logs
export const logEmitter = new EventEmitter();

// Create base Pino logger with event emission
export const logger = pino({
  level: 'debug',
  base: { service: 'superglue' },
  timestamp: true,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname,service',
      messageFormat: '{msg}',
    }
  },
  hooks: {
    logMethod(inputArgs: any[], method: any, level: number) {
      const logEntry: LogEntry = {
        id: crypto.randomUUID(),
        message: inputArgs[0],
        level: String(levelMap[level]).toUpperCase(),
        timestamp: new Date(),
        runId: inputArgs[1]?.runId || '',
        orgId: inputArgs[1]?.orgId || ''
      };

      // Emit log event
      logEmitter.emit('log', logEntry);

      // Continue with normal Pino logging
      method.apply(this, inputArgs);
    }
  }
});

// Helper function for easier logging
export function logMessage(level: 'info' | 'error' | 'warn' | 'debug', message: string, metadata: Metadata = {}) {
  logger[level](message, metadata);
}