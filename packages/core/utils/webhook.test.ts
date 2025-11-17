import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as httpModule from '../tools/strategies/http/http.js';
import { notifyWebhook } from './webhook.js';

vi.mock('../tools/tool-steps/strategies/http/http.js');

describe('notifyWebhook', () => {
  let callAxiosSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    callAxiosSpy = vi.spyOn(httpModule, 'callAxios').mockResolvedValue({ 
      response: { status: 200, data: {}, headers: {}, statusText: 'OK', config: {} },
      retriesAttempted: 0
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call webhook with success data', async () => {
    const webhookUrl = 'https://example.com/webhook';
    const callId = '123';
    const data = { foo: 'bar' };

    await notifyWebhook(webhookUrl, callId, true, data);

    expect(callAxiosSpy).toHaveBeenCalledWith(
      {
        method: 'POST',
        url: webhookUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          callId,
          success: true,
          data
        })
      },
      { timeout: 10000, retries: 3, retryDelay: 10000 }
    );
  });

  it('should call webhook with error data', async () => {
    const webhookUrl = 'https://example.com/webhook';
    const callId = '123';
    const error = 'Something went wrong';

    await notifyWebhook(webhookUrl, callId, false, undefined, error);

    expect(callAxiosSpy).toHaveBeenCalledWith(
      {
        method: 'POST',
        url: webhookUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          callId,
          success: false,
          error
        })
      },
      { timeout: 10000, retries: 3, retryDelay: 10000 }
    );
  });

  it('should not throw if callAxios fails', async () => {
    const webhookUrl = 'https://example.com/webhook';
    const callId = '123';

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    callAxiosSpy.mockRejectedValueOnce(new Error('Network error'));

    // Should not throw
    await expect(notifyWebhook(webhookUrl, callId, true)).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});