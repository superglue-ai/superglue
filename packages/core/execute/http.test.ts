import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import { server_defaults } from "../default.js";
import { callAxios } from "./http.js";

vi.mock('axios');

describe('api utility functions', () => {

describe('callAxios automatic retry', () => {
    it('retries quick failures up to maxRetries and returns metadata', async () => {
      (axios as any).mockReset();
      (axios as any)
        .mockImplementationOnce(async (_cfg: any) => ({ status: 500, data: Buffer.from('X'), headers: {}, config: {} }))
        .mockImplementationOnce(async (_cfg: any) => ({ status: 502, data: Buffer.from('X'), headers: {}, config: {} }))
        .mockImplementationOnce(async (_cfg: any) => ({ status: 200, data: Buffer.from('OK'), headers: {}, config: {} }));

      const { response, retriesAttempted, lastFailureStatus } = await callAxios({ method: 'GET', url: 'https://example.com' } as any, { retries: 2, retryDelay: 1 } as any);
      expect(response.status).toBe(200);
      expect(retriesAttempted).toBe(2);
      expect(lastFailureStatus).toBe(502);
      (axios as any).mockReset();
    });

    it('returns immediately for 429 beyond max wait budget without throwing', async () => {
      (axios as any).mockReset();
      const tooLongSeconds = Math.ceil(server_defaults.AXIOS_MAX_RATE_LIMIT_WAIT_MS / 1000) + 1;
      (axios as any).mockImplementation(async (_cfg: any) => ({ status: 429, data: Buffer.from('rate'), headers: { 'retry-after': String(tooLongSeconds) }, config: {} }));

      const { response, retriesAttempted } = await callAxios({ method: 'GET', url: 'https://example.com' } as any, { retries: 1, retryDelay: 1 } as any);
      expect(response.status).toBe(429);
      expect(retriesAttempted).toBe(0);
      (axios as any).mockReset();
    });
  });
});