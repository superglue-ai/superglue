import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authMiddleware, validateToken, extractToken } from './auth.js'
import { LocalKeyManager } from './localKeyManager.js'
import { SupabaseKeyManager } from './supabaseKeyManager.js'

vi.mock('./localKeyManager.js')
vi.mock('./supabaseKeyManager.js')
vi.mock('../utils/logs.js')

describe('Auth Module', () => {
  describe('extractToken', () => {
    it('extracts token from HTTP Authorization header', () => {
      const req = { headers: { authorization: 'Bearer test123' } }
      expect(extractToken(req)).toBe('test123')
    })

    it('extracts token from query parameter', () => {
      const req = { headers: {}, query: { token: 'test123' } }
      expect(extractToken(req)).toBe('test123')
    })

    it('extracts token from WebSocket connectionParams', () => {
      const conn = { connectionParams: { Authorization: 'Bearer test123' } }
      expect(extractToken(conn)).toBe('test123')
    })

    it('extracts token from WebSocket URL', () => {
      const conn = { 
        connectionParams: {},
        extra: { request: { url: 'ws://localhost?token=test123&other=param' } }
      }
      expect(extractToken(conn)).toBe('test123')
    })
  })

  describe('validateToken', () => {
    it('returns failure when no token provided', async () => {
      const result = await validateToken(undefined)
      expect(result).toEqual({
        success: false,
        message: 'No token provided',
        orgId: undefined
      })
    })

    it('validates token through auth manager', async () => {
      const mockAuthResult = { success: true, orgId: 'org123' }
      vi.mocked(LocalKeyManager.prototype.authenticate).mockResolvedValue(mockAuthResult)

      const result = await validateToken('test123')
      expect(result).toEqual({
        success: true,
        message: '',
        orgId: 'org123'
      })
    })
  })

  describe('authMiddleware', () => {
    let mockReq: any
    let mockRes: any
    let mockNext: any

    beforeEach(() => {
      mockReq = { headers: {}, path: '/test' }
      mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn()
      }
      mockNext = vi.fn()
    })

    it('skips auth for websocket connections', async () => {
      mockReq.headers.upgrade = 'websocket'
      await authMiddleware(mockReq, mockRes, mockNext)
      expect(mockNext).toHaveBeenCalled()
    })

    it('skips auth for health check', async () => {
      mockReq.path = '/health'
      await authMiddleware(mockReq, mockRes, mockNext)
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.send).toHaveBeenCalledWith('OK')
    })

    it('returns 401 for invalid token', async () => {
      mockReq.headers.authorization = 'Bearer invalid'
      vi.mocked(LocalKeyManager.prototype.authenticate).mockResolvedValue({ 
        success: false, 
        orgId: undefined 
      })

      await authMiddleware(mockReq, mockRes, mockNext)
      expect(mockRes.status).toHaveBeenCalledWith(401)
    })

    it('adds orgId to request and proceeds for valid token', async () => {
      mockReq.headers.authorization = 'Bearer valid'
      vi.mocked(LocalKeyManager.prototype.authenticate).mockResolvedValue({ 
        success: true, 
        orgId: 'org123' 
      })

      await authMiddleware(mockReq, mockRes, mockNext)
      expect(mockReq.orgId).toBe('org123')
      expect(mockReq.headers.orgId).toBe('org123')
      expect(mockNext).toHaveBeenCalled()
    })
  })
})
