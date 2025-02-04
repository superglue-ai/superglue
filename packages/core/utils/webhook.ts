import { AxiosRequestConfig } from "axios";
import { callAxios } from "./tools.js";


// Handle webhook notification
export async function notifyWebhook(webhookUrl: string, callId: string, success: boolean, data?: any, error?: string) {
  try {
    const axiosConfig: AxiosRequestConfig = {
      method: 'POST',
      url: webhookUrl,
      data: {
        callId,
        success,
        ...(data && { data }),
        ...(error && { error })
      }
    };
    await callAxios(axiosConfig, { timeout: 10000, retries: 3, retryDelay: 10000 });
  } catch (error) {
    console.error('Webhook notification failed:', error);
    // Don't throw, webhook failures shouldn't affect main operation
  }
}