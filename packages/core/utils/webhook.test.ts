import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callAxios } from '../execute/api/api.js';
import { notifyWebhook } from './webhook.js';

// Mock the callAxios function
vi.mock('../execute/api/api.js', () => ({
  callAxios: vi.fn()
}));

describe('notifyWebhook', () => {
  beforeEach(() => {
    // Clear mock before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should call webhook with success data', async () => {
    const webhookUrl = 'https://example.com/webhook';
    const callId = '123';
    const data = { foo: 'bar' };

    await notifyWebhook(webhookUrl, callId, true, data);

    expect(callAxios).toHaveBeenCalledWith(
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

    expect(callAxios).toHaveBeenCalledWith(
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

    // Mock console.error to avoid cluttering test output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    // Make callAxios throw an error
    (callAxios as any).mockRejectedValueOnce(new Error('Network error'));

    // Should not throw
    await expect(notifyWebhook(webhookUrl, callId, true)).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});