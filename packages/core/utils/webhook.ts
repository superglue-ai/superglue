import { AxiosRequestConfig } from "axios";
import { callAxios } from "../tools/strategies/http/http.js";
import { logMessage } from "./logs.js";
import { Metadata } from "pdf-parse";

interface WebhookPayload {
  runId: string;
  traceId: string;
  success: boolean;
  data?: any;
  error?: string;
}

// Handle webhook notification
export async function notifyWebhook(webhookUrl: string, runId: string, traceId: string, success: boolean, data?: any, error?: string, metadata?: Metadata) {
  try {
    const webhookPayload: WebhookPayload = {
      runId,
      traceId,
      success,
      ...(data && { data }),
      ...(error && { error })
    };

    const axiosConfig: AxiosRequestConfig = {
      method: 'POST',
      url: webhookUrl,
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(webhookPayload)
    };
    await callAxios(axiosConfig, { timeout: 10000, retries: 3, retryDelay: 10000 });
  } catch (error) {
    logMessage('error', `Webhook notification failed: ${error}`, metadata);
    // Don't throw, webhook failures shouldn't affect main operation
  }
}