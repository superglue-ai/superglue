import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetAuthManager, authMiddleware, extractTokenFromExpressRequest, validateToken } from './auth.js';

vi.mock('./localKeyManager.js')
vi.mock('./supabaseKeyManager.js')
vi.mock('../utils/logs.js')

describe('Auth Module', () => {
  describe('extractTokenFromExpressRequest', () => {
    it('extracts token from HTTP Authorization header', () => {
      const req = { headers: { authorization: 'Bearer test123' } }
      expect(extractTokenFromExpressRequest(req)).toBe('test123')
    })

    it('extracts token from query parameter', () => {
      const req = { headers: {}, query: { token: 'test123' } }
      expect(extractTokenFromExpressRequest(req)).toBe('test123')
    })

    it('extracts token from WebSocket connectionParams', () => {
      const conn = { connectionParams: { Authorization: 'Bearer test123' } }
      expect(extractTokenFromExpressRequest(conn)).toBe('test123')
    })

    it('extracts token from WebSocket URL', () => {
      const conn = {
        connectionParams: {},
        extra: { request: { url: 'ws://localhost?token=test123&other=param' } }
      }
      expect(extractTokenFromExpressRequest(conn)).toBe('test123')
    })
  })

  describe('validateToken', () => {
    let mockAuthManager: any;

    beforeEach(() => {
      _resetAuthManager();
      // Create mock instance with authenticate method
      mockAuthManager = {
        authenticate: vi.fn()
      };

      // Reset the mock function calls before each test
      mockAuthManager.authenticate.mockReset();

      // Directly set the internal auth manager to our mock instance
      _resetAuthManager(mockAuthManager);
    })

    it('returns failure when no token provided', async () => {
      // Reset manager to null for this specific test case where getAuthManager shouldn't be called with a token
      _resetAuthManager(null);
      const result = await validateToken(undefined)
      expect(result).toEqual({
        success: false,
        message: 'No token provided',
        orgId: undefined
      })
    })

    it('validates token through auth manager', async () => {
      const mockAuthResult = { success: true, orgId: 'org123' };
      mockAuthManager.authenticate.mockResolvedValue(mockAuthResult);

      const result = await validateToken('test123');
      expect(mockAuthManager.authenticate).toHaveBeenCalledWith('test123');
      expect(result).toEqual({
        success: true,
        message: 'Authentication successful',
        orgId: 'org123'
      });
    })
  })

  describe('authMiddleware', () => {
    let mockReq: any
    let mockRes: any
    let mockNext: any
    let mockAuthManager: any

    beforeEach(() => {
      _resetAuthManager();
      mockReq = { headers: {}, path: '/test' }
      mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn()
      }
      mockNext = vi.fn()
      mockAuthManager = {
        authenticate: vi.fn()
      };
      // Directly set the internal auth manager to our mock instance
      _resetAuthManager(mockAuthManager);
    })

    it('skips auth for health check', async () => {
      mockReq.path = '/health'
      await authMiddleware(mockReq, mockRes, mockNext)
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.send).toHaveBeenCalledWith('OK')
    })

    it('returns 401 for invalid token', async () => {
      mockReq.headers.authorization = 'Bearer invalid'
      mockAuthManager.authenticate.mockResolvedValue({
        success: false,
        orgId: undefined
      })

      await authMiddleware(mockReq, mockRes, mockNext)
      expect(mockAuthManager.authenticate).toHaveBeenCalledWith('invalid');
      expect(mockRes.status).toHaveBeenCalledWith(401)
    })

    it('adds orgId to request and proceeds for valid token', async () => {
      mockReq.headers.authorization = 'Bearer valid'
      mockAuthManager.authenticate.mockResolvedValue({
        success: true,
        orgId: 'org123'
      })

      await authMiddleware(mockReq, mockRes, mockNext)
      expect(mockAuthManager.authenticate).toHaveBeenCalledWith('valid');
      expect(mockReq.orgId).toBe('org123')
      expect(mockReq.headers.orgId).toBe('org123')
      expect(mockNext).toHaveBeenCalled()
    })
  })
})
