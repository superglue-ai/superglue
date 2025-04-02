import { EventEmitter } from 'events';
import { Context, LogEntry } from "@superglue/shared";
import { logEmitter } from '../../utils/logs.js';
// Export resolver
export const logsResolver = {
    subscribe: (_, {}, context: Context) => {
        const orgId = context.orgId;
        return {
        [Symbol.asyncIterator]() {
            const emitter = new EventEmitter();
            
            // Handler for new logs
            const logHandler = (log: LogEntry) => {
            // Only emit if org matches and runId matches (if specified)
            if (log.orgId === orgId) {
                emitter.emit('data', { logs: log });
            }
            };

            // Subscribe to log events
            logEmitter.on('log', logHandler);

            return {
            next() {
                return new Promise((resolve) => {
                emitter.once('data', (value) => {
                    resolve({ value, done: false });
                });
                });
            },
            return() {
                logEmitter.removeListener('log', logHandler);
                return Promise.resolve({ value: undefined, done: true });
            },
            throw(error: Error) {
                logEmitter.removeListener('log', logHandler);
                return Promise.reject(error);
            },
            [Symbol.asyncIterator]() {
                return this;
            }
            };
        }
        };
    }
};

