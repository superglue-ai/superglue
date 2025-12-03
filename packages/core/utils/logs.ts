import { Log, ServiceMetadata } from "@superglue/shared";
import EventEmitter from "events";
import pino from "pino";

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
      // In pino v9, the first argument is the message or object
      // The second argument (if present) is the metadata
      let message = '';
      let metadata: any = {};
      
      if (typeof inputArgs[0] === 'string') {
        message = inputArgs[0];
        metadata = inputArgs[1] || {};
      } else if (typeof inputArgs[0] === 'object' && inputArgs[0] !== null) {
        metadata = inputArgs[0];
        message = inputArgs[1] || '';
      }

      const logEntry: Log = {
        id: crypto.randomUUID(),
        message: message,
        level: String(levelMap[level]).toUpperCase(),
        timestamp: new Date(),
        traceId: metadata.traceId || '',
        orgId: metadata.orgId || ''
      };

      // Emit log event
      logEmitter.emit('log', logEntry);

      // Continue with normal Pino logging
      return method.apply(this, inputArgs);
    }
  }
});

// Helper function for easier logging with metadata
export function logMessage(level: 'info' | 'error' | 'warn' | 'debug', message: string, metadata: ServiceMetadata = { orgId: '' }) {
  // In pino v9, metadata should be passed as the first argument when logging
  logger[level](metadata, message);
}