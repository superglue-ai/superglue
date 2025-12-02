import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as httpModule from '../tools/strategies/http/http.js';
import * as logsModule from './logs.js';
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
    const runId = '123';
    const data = { foo: 'bar' };

    await notifyWebhook(webhookUrl, runId, true, data, undefined, {orgId: '123', traceId: '456'});

    expect(callAxiosSpy).toHaveBeenCalledWith(
      {
        method: 'POST',
        url: webhookUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          runId,
          success: true,
          data
        })
      },
      { timeout: 10000, retries: 3, retryDelay: 10000 }
    );
  });

  it('should call webhook with error data', async () => {
    const webhookUrl = 'https://example.com/webhook';
    const runId = '123';
    const error = 'Something went wrong';

    await notifyWebhook(webhookUrl, runId, false, undefined, error, {orgId: '123', traceId: '456'});

    expect(callAxiosSpy).toHaveBeenCalledWith(
      {
        method: 'POST',
        url: webhookUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          runId,
          success: false,
          error
        })
      },
      { timeout: 10000, retries: 3, retryDelay: 10000 }
    );
  });

  it('should not throw if callAxios fails', async () => {
    const webhookUrl = 'https://example.com/webhook';
    const runId = '123';
    const traceId = '456';

    const logMessageSpy = vi.spyOn(logsModule, 'logMessage').mockImplementation(() => { });

    callAxiosSpy.mockRejectedValueOnce(new Error('Network error'));

    // Should not throw
    await expect(notifyWebhook(webhookUrl, runId, true, undefined, undefined, {orgId: '123', traceId: '456'})).resolves.not.toThrow();

    expect(logMessageSpy).toHaveBeenCalledWith('error', expect.stringContaining('Webhook notification failed'), {orgId: '123', traceId: '456'});
    logMessageSpy.mockRestore();
  });
});