import { Context, LogEntry } from "@superglue/shared";
import { EventEmitter } from 'events';
import { logEmitter } from '../../utils/logs.js';
// Export resolver
export const logsResolver = {
    subscribe: (_, { }, context: Context) => {
        const orgId = context.orgId;
        return {
            [Symbol.asyncIterator]() {
                const emitter = new EventEmitter();

                // Handler for new logs
                const logHandler = (log: LogEntry) => {
                    // Skip log streaming during integration tests to avoid duplicate logging
                    if (process.env.INTEGRATION_TEST_MODE === 'true') {
                        return;
                    }

                    if (log.orgId === orgId || (!orgId)) {
                        // Add small delay to ensure subscription is ready
                        setTimeout(() => {
                            emitter.emit('data', { logs: log });
                        }, 0);
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

