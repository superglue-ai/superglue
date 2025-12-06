import { Log } from '@superglue/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logEmitter, logger, logMessage } from './logs.js';

describe('Logging Module', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'info')
    vi.spyOn(logger, 'error')
    vi.spyOn(logger, 'warn')
    vi.spyOn(logger, 'debug')
    vi.spyOn(logEmitter, 'emit')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    logEmitter.removeAllListeners()
  })

  describe('logMessage', () => {
    it('logs messages with correct level', () => {
      logMessage('info', 'test info message', { orgId: 'test' })
      expect(logger.info).toHaveBeenCalledWith({ orgId: 'test' }, 'test info message')

      logMessage('error', 'test error message', { orgId: 'test' })
      expect(logger.error).toHaveBeenCalledWith({ orgId: 'test' }, 'test error message')

      logMessage('warn', 'test warn message', { orgId: 'test' })
      expect(logger.warn).toHaveBeenCalledWith({ orgId: 'test' }, 'test warn message')

      logMessage('debug', 'test debug message', { orgId: 'test' })
      expect(logger.debug).toHaveBeenCalledWith({ orgId: 'test' }, 'test debug message')
    })

    it('includes metadata in log message', () => {
      const metadata = { orgId: 'test-org', userId: '123' }
      logMessage('info', 'test message', metadata)
      expect(logger.info).toHaveBeenCalledWith(metadata, 'test message')
    })
  })

  describe('logEmitter', () => {
    it('emits log events with correct structure', (done) => {
      const testMessage = 'test log message'
      const testMetadata = { orgId: 'test-org' }

      logEmitter.once('log', (logEntry: Log) => {
        expect(logEntry).toMatchObject({
          message: testMessage,
          level: 'INFO',
          orgId: 'test-org'
        })
        expect(logEntry.id).toBeDefined()
        expect(logEntry.timestamp).toBeInstanceOf(Date)
      })

      logMessage('info', testMessage, testMetadata)
    })

    it('generates unique IDs for each log entry', () => {
      const logIds = new Set()
      const listener = (logEntry: Log) => {
        logIds.add(logEntry.id)
      }

      logEmitter.on('log', listener)

      // Generate multiple logs
      for (let i = 0; i < 3; i++) {
        logMessage('info', `message ${i}`, { orgId: 'test' })
      }

      logEmitter.removeListener('log', listener)
      expect(logIds.size).toBe(3)
    })
  })

  describe('log levels', () => {
    it('calls correct pino level method for each log level', () => {
      const levelTests = [
        { message: 'debug message', level: 'debug' },
        { message: 'info message', level: 'info' },
        { message: 'warn message', level: 'warn' },
        { message: 'error message', level: 'error' }
      ]

      levelTests.forEach(test => {
        logMessage(test.level as any, test.message, { orgId: 'test' })
        expect(logger[test.level]).toHaveBeenCalledWith({ orgId: 'test' }, test.message)
      })
    })
  })
})
