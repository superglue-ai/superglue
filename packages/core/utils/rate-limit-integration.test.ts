import { ApiConfig, HttpMethod } from '@superglue/shared';
import express from 'express';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callEndpoint } from './api.js';

describe('Rate Limit Integration Test with real server', () => {
  let server: any;
  let baseUrl: string;
  let requestCount = 0;
  
  // Mock server that returns 429 responses
  beforeAll(async () => {
    const app = express();
    // Endpoint returns 429 on first call, then 200
    app.get('/api/test-rate-limit', (req, res) => {
      requestCount++;
      if (requestCount === 1) {
        res.setHeader('Retry-After', '1');
        res.status(429).json({ error: 'Rate limit exceeded' });
      } else {
        res.status(200).json({ success: true, data: 'Rate limit test passed' });
      }
    });
    // Endpoint that always returns 429 with a long retry time
    app.get('/api/always-rate-limited', (req, res) => {
      res.setHeader('Retry-After', '61');  // 61 seconds is greater than the hardcoded 60s limit
      res.status(429).json({ error: 'Rate limit exceeded' });
    });
    
    // Start the server
    return new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://localhost:${address.port}`;
        console.log(`Mock server running at ${baseUrl}`);
        resolve();
      });
    });
  });
  
  afterAll(() => {
    if (server) {
      server.close();
    }
  });
  
  it('should successfully retry after a 429 response', async () => {
    requestCount = 0;
    
    const config: ApiConfig = {
      id: 'test-rate-limit-integration',
      urlHost: baseUrl,
      urlPath: 'api/test-rate-limit',
      method: HttpMethod.GET,
      instruction: 'Test rate limit integration',
      // maxRateLimitWaitSec: 5,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await callEndpoint(config, {}, {}, {});
    // Should have made 2 requests (one 429, one 200)
    expect(requestCount).toBe(2);
    expect(result.data).toEqual({ success: true, data: 'Rate limit test passed' });
  });
  
  it('should fail when rate limit wait time exceeds maximum', async () => {
    // Modify the server to return a retry time that exceeds the hardcoded 60s limit
    const config: ApiConfig = {
      id: 'test-always-rate-limited',
      urlHost: baseUrl,
      urlPath: 'api/always-rate-limited',
      method: HttpMethod.GET,
      instruction: 'Test always rate limited',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    // Should throw an error about rate limit exceeded
    await expect(callEndpoint(config, {}, {}, {}))
      .rejects.toThrow(/Rate limit exceeded/);
  });
}); 
