import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, logMessage, logEmitter } from './logs.js'
import { LogEntry } from '@superglue/shared'

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
      logMessage('info', 'test info message')
      expect(logger.info).toHaveBeenCalledWith('test info message', {})

      logMessage('error', 'test error message')
      expect(logger.error).toHaveBeenCalledWith('test error message', {})

      logMessage('warn', 'test warn message')
      expect(logger.warn).toHaveBeenCalledWith('test warn message', {})

      logMessage('debug', 'test debug message')
      expect(logger.debug).toHaveBeenCalledWith('test debug message', {})
    })

    it('includes metadata in log message', () => {
      const metadata = { orgId: 'test-org', userId: '123' }
      logMessage('info', 'test message', metadata)
      expect(logger.info).toHaveBeenCalledWith('test message', metadata)
    })
  })

  describe('logEmitter', () => {
    it('emits log events with correct structure', (done) => {
      const testMessage = 'test log message'
      const testMetadata = { orgId: 'test-org' }

      logEmitter.once('log', (logEntry: LogEntry) => {
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
      const listener = (logEntry: LogEntry) => {
        logIds.add(logEntry.id)
      }

      logEmitter.on('log', listener)

      // Generate multiple logs
      for (let i = 0; i < 3; i++) {
        logMessage('info', `message ${i}`)
      }

      logEmitter.removeListener('log', listener)
      expect(logIds.size).toBe(3)
    })
  })

  describe('levelMap', () => {
    it('maps pino levels to correct log levels', () => {
      const levelTests = [
        { message: 'debug message', level: 'debug', pinoLevel: 20 },
        { message: 'info message', level: 'info', pinoLevel: 30 },
        { message: 'warn message', level: 'warn', pinoLevel: 40 },
        { message: 'error message', level: 'error', pinoLevel: 50 }
      ]

      levelTests.forEach(test => {
        logMessage(test.level as any, test.message)
        expect(logger[test.level]).toHaveBeenCalledWith(test.message, {})
      })
    })
  })
})
