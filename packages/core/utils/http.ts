/**
 * HTTP utilities for main thread operations (webhooks, etc.)
 * These don't require sandboxed execution.
 */

import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";
import { server_defaults } from "../default.js";
import { parseJSON } from "../files/index.js";
import { logMessage } from "./logs.js";
import { RequestOptions } from "@superglue/shared";

export class ApiCallError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "ApiCallError";
    this.statusCode = statusCode;
  }
}

export interface CallAxiosResult {
  response: AxiosResponse;
  retriesAttempted: number;
  lastFailureStatus?: number;
}

function configureHttpsAgent(): https.Agent {
  const keepAliveEnabled = process.env.AXIOS_KEEP_ALIVE !== "false";

  const baseConfig = {
    rejectUnauthorized: false,
    keepAlive: keepAliveEnabled,
  };

  if (!keepAliveEnabled) {
    return new https.Agent({
      ...baseConfig,
      maxSockets: server_defaults.HTTP.MAX_SOCKETS,
      maxFreeSockets: server_defaults.HTTP.MAX_FREE_SOCKETS,
      timeout: server_defaults.HTTP.DEFAULT_TIMEOUT,
    });
  }

  return new https.Agent(baseConfig);
}

const httpsAgent = configureHttpsAgent();

export async function callAxios(
  config: AxiosRequestConfig,
  options: RequestOptions,
): Promise<CallAxiosResult> {
  let retryCount = 0;
  const defaultRetries = process.env.AXIOS_KEEP_ALIVE === "false" ? 3 : 1;
  const maxRetries = Math.min(options?.retries ?? defaultRetries, server_defaults.MAX_CALL_RETRIES);
  const delay = options?.retryDelay || server_defaults.HTTP.DEFAULT_RETRY_DELAY_MS;
  const maxRateLimitWaitMs = server_defaults.HTTP.MAX_RATE_LIMIT_WAIT_MS;
  let rateLimitRetryCount = 0;
  let totalRateLimitWaitTime = 0;
  let lastFailureStatus: number | undefined;

  config.headers = {
    Accept: "*/*",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    ...config.headers,
  };

  // Don't send body for GET, HEAD, DELETE, OPTIONS
  if (["GET", "HEAD", "DELETE", "OPTIONS"].includes(config.method!)) {
    config.data = undefined;
  } else if (typeof config.data === "string" && config.data.trim().startsWith("{")) {
    try {
      config.data = parseJSON(config.data);
    } catch (error) {}
  } else if (!config.data) {
    config.data = undefined;
  }

  do {
    let response: AxiosResponse | null = null;
    try {
      const startTs = Date.now();
      response = await axios({
        ...config,
        responseType: "arraybuffer",
        validateStatus: null,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        decompress: true,
        httpsAgent,
      });
      const durationMs = Date.now() - startTs;

      if (response.status === 429) {
        let waitTime = 0;
        if (response.headers["retry-after"]) {
          const retryAfter = response.headers["retry-after"];
          if (/^\d+$/.test(retryAfter)) {
            waitTime = parseInt(retryAfter, 10) * 1000;
          } else {
            const retryDate = new Date(retryAfter);
            waitTime = retryDate.getTime() - Date.now();
          }
        } else {
          waitTime = Math.min(
            Math.pow(4, rateLimitRetryCount) * 1000 + Math.random() * 100,
            3600000,
          );
        }

        if (totalRateLimitWaitTime + waitTime > maxRateLimitWaitMs) {
          if (response.data instanceof ArrayBuffer) {
            response.data = Buffer.from(response.data);
          }
          return { response, retriesAttempted: retryCount, lastFailureStatus };
        }

        await new Promise((resolve) => setTimeout(resolve, waitTime));

        totalRateLimitWaitTime += waitTime;
        rateLimitRetryCount++;
        continue;
      }
      if (response.data instanceof ArrayBuffer) {
        response.data = Buffer.from(response.data);
      }
      if (response.status < 200 || response.status >= 300) {
        if (
          response.status !== 429 &&
          retryCount < maxRetries &&
          durationMs < server_defaults.HTTP.QUICK_RETRY_THRESHOLD_MS
        ) {
          lastFailureStatus = response.status;
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return {
          response,
          retriesAttempted: retryCount,
          lastFailureStatus: lastFailureStatus ?? response.status,
        };
      }
      if (retryCount > 0) {
        const method = (config.method || "GET").toString().toUpperCase();
        const url = (config as any).url || "";
        logMessage(
          "debug",
          `Automatic retry succeeded for ${method} ${url} after ${retryCount} retr${retryCount === 1 ? "y" : "ies"}${lastFailureStatus ? `; last failure status: ${lastFailureStatus}` : ""}`,
        );
      }
      return { response, retriesAttempted: retryCount, lastFailureStatus };
    } catch (error) {
      if (retryCount >= maxRetries) {
        const baseMessage = (error as any).message || "Network error";
        const withRetryInfo = `${baseMessage} (retries attempted: ${retryCount}${lastFailureStatus ? `, last failure status: ${lastFailureStatus}` : ""})`;
        throw new ApiCallError(withRetryInfo, response?.status);
      }
      lastFailureStatus = response?.status;
      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, delay * retryCount));
    }
  } while (retryCount <= maxRetries || rateLimitRetryCount > 0);

  // Defensive: every iteration should return or throw, but TypeScript cannot
  // verify this statically. An explicit throw here keeps the return type
  // honest and prevents silent undefined if the retry logic is ever refactored.
  throw new ApiCallError(
    `Request failed: retry loop exited unexpectedly after ${retryCount} retries`,
    lastFailureStatus,
  );
}
