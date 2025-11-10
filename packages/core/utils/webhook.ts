import { AxiosRequestConfig } from "axios";
import { callAxios } from "../execute/api/api.js";

// Handle webhook notification
export async function notifyWebhook(
  webhookUrl: string,
  callId: string,
  success: boolean,
  data?: any,
  error?: string,
) {
  try {
    const webhookPayload = {
      callId,
      success,
      ...(data && { data }),
      ...(error && { error }),
    };

    const axiosConfig: AxiosRequestConfig = {
      method: "POST",
      url: webhookUrl,
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify(webhookPayload),
    };
    await callAxios(axiosConfig, {
      timeout: 10000,
      retries: 3,
      retryDelay: 10000,
    });
  } catch (error) {
    console.error("Webhook notification failed:", error);
    // Don't throw, webhook failures shouldn't affect main operation
  }
}
