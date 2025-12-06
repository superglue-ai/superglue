import { Log, ServiceMetadata } from "@superglue/shared";
import EventEmitter from "events";
import pino from "pino";
import { isMainThread, parentPort } from "worker_threads";

export const logEmitter = new EventEmitter();

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
  }
});

export function logMessage(level: 'info' | 'error' | 'warn' | 'debug', message: string, metadata: ServiceMetadata = { orgId: '' }) {
      const logEntry: Log = {
        id: crypto.randomUUID(),
    message,
    level: level.toUpperCase(),
        timestamp: new Date(),
        traceId: metadata.traceId || '',
        orgId: metadata.orgId || ''
      };

  if (isMainThread) {
      logEmitter.emit('log', logEntry);
  logger[level](metadata, message);
  } else {
    parentPort?.postMessage({ type: 'log', payload: logEntry });
  }
}
