import { RequestOptions } from "@superglue/client";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import https from 'https';
import { getDeceptive2xxErrorContext as get2xxErrorContext, getAuthErrorContext, getClientErrorContext } from "../../context/context-error-messages.js";
import { server_defaults } from "../../default.js";
import { maskCredentials } from "../../utils/helpers.js";
import { parseJSON } from "../../utils/json-parser.js";
import { logMessage } from "../../utils/logs.js";

export interface CallAxiosResult {
  response: AxiosResponse;
  retriesAttempted: number;
  lastFailureStatus?: number;
}

function configureHttpsAgent(): https.Agent {
  const keepAliveEnabled = process.env.AXIOS_KEEP_ALIVE !== 'false';

  const baseConfig = {
    rejectUnauthorized: false,
    keepAlive: keepAliveEnabled
  };

  if (!keepAliveEnabled) {
    return new https.Agent({
      ...baseConfig,
      maxSockets: server_defaults.AXIOS.MAX_SOCKETS,
      maxFreeSockets: server_defaults.AXIOS.MAX_FREE_SOCKETS,
      timeout: server_defaults.AXIOS.TIMEOUT
    });
  }

  return new https.Agent(baseConfig);
}

const httpsAgent = configureHttpsAgent();

export async function callAxios(config: AxiosRequestConfig, options: RequestOptions): Promise<CallAxiosResult> {
  let retryCount = 0;
  const defaultRetries = process.env.AXIOS_KEEP_ALIVE === 'false' ? 3 : 1;
  const maxRetries = Math.min(options?.retries ?? defaultRetries, server_defaults.MAX_CALL_RETRIES);
  const delay = options?.retryDelay || server_defaults.AXIOS.DEFAULT_RETRY_DELAY_MS;
  const maxRateLimitWaitMs = server_defaults.AXIOS.MAX_RATE_LIMIT_WAIT_MS;
  let rateLimitRetryCount = 0;
  let totalRateLimitWaitTime = 0;
  let lastFailureStatus: number | undefined;

  config.headers = {
    "Accept": "*/*",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    ...config.headers,
  };

  // Don't send body for GET, HEAD, DELETE, OPTIONS
  if (["GET", "HEAD", "DELETE", "OPTIONS"].includes(config.method!)) {
    config.data = undefined;
  }
  else if (config.data && config.data.trim().startsWith("{")) {
    try {
      config.data = parseJSON(config.data);
    } catch (error) { }
  }
  else if (!config.data) {
    config.data = undefined;
  }

  do {
    let response: AxiosResponse | null = null;
    try {
      const startTs = Date.now();
      response = await axios({
        ...config,
        responseType: 'arraybuffer', // ALWAYS use arraybuffer to preserve data integrity
        validateStatus: null, // Don't throw on any status
        maxContentLength: Infinity, // No limit on response size
        maxBodyLength: Infinity, // No limit on response body size
        decompress: true, // Ensure gzip/deflate responses are decompressed
        httpsAgent
      });
      const durationMs = Date.now() - startTs;

      if (response.status === 429) {

        let waitTime = 0;
        if (response.headers['retry-after']) {
          // Retry-After can be a date or seconds
          const retryAfter = response.headers['retry-after'];
          if (/^\d+$/.test(retryAfter)) {
            waitTime = parseInt(retryAfter, 10) * 1000;
          } else {
            const retryDate = new Date(retryAfter);
            waitTime = retryDate.getTime() - Date.now();
          }
        } else {
          // Exponential backoff with jitter - max wait time is 1 hour
          waitTime = Math.min(Math.pow(10, rateLimitRetryCount) * 1000 + Math.random() * 100, 3600000);
        }

        // Check if we've exceeded the maximum wait time
        if (totalRateLimitWaitTime + waitTime > maxRateLimitWaitMs) {
          // Convert ArrayBuffer to Buffer even for error responses
          if (response.data instanceof ArrayBuffer) {
            response.data = Buffer.from(response.data);
          }
          return { response, retriesAttempted: retryCount, lastFailureStatus };
        }

        await new Promise(resolve => setTimeout(resolve, waitTime));

        totalRateLimitWaitTime += waitTime;
        rateLimitRetryCount++;
        continue;
      }
      if (response.data instanceof ArrayBuffer) {
        response.data = Buffer.from(response.data);
      }
      if (response.status < 200 || response.status >= 300) {
        if (response.status !== 429 && retryCount < maxRetries && durationMs < server_defaults.AXIOS.QUICK_RETRY_THRESHOLD_MS) {
          lastFailureStatus = response.status;
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return { response, retriesAttempted: retryCount, lastFailureStatus: lastFailureStatus ?? response.status };
      }
      if (retryCount > 0) {
        const method = (config.method || "GET").toString().toUpperCase();
        const url = (config as any).url || "";
        logMessage("debug", `Automatic retry succeeded for ${method} ${url} after ${retryCount} retr${retryCount === 1 ? "y" : "ies"}${lastFailureStatus ? `; last failure status: ${lastFailureStatus}` : ""}`);
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
      await new Promise(resolve => setTimeout(resolve, delay * retryCount));
    }
  } while (retryCount <= maxRetries || rateLimitRetryCount > 0);  // separate max retries and rate limit retries
}


export class ApiCallError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number,) {
    super(message);
    this.name = 'ApiCallError';
    this.statusCode = statusCode;
  }
}
export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}
type StatusHandlerResult = { shouldFail: boolean; message?: string };

function detectHtmlErrorResponse(data: any): { isHtml: boolean; preview?: string } {
  const MAX_HTML_CHECK_BYTES = 1024; // Only check first 1KB for efficiency
  let dataPrefix = '';

  if (data instanceof Buffer) {
    // Only convert first 1KB to string for HTML detection
    const bytesToRead = Math.min(data.length, MAX_HTML_CHECK_BYTES);
    dataPrefix = data.subarray(0, bytesToRead).toString('utf-8');
  } else if (typeof data === 'string') {
    dataPrefix = data.slice(0, MAX_HTML_CHECK_BYTES);
  } else {
    return { isHtml: false };
  }

  const trimmedLower = dataPrefix.slice(0, 100).trim().toLowerCase();
  const isHtml = trimmedLower.startsWith('<!doctype html') || trimmedLower.startsWith('<html');

  return {
    isHtml,
    preview: dataPrefix
  };
}


type StatusHandlerInput = {
  response: AxiosResponse;
  axiosConfig: AxiosRequestConfig;
  credentials?: Record<string, any>;
  payload?: Record<string, any>;
  retriesAttempted?: number;
  lastFailureStatus?: number | undefined;
};

export function handle2xxStatus(
  input: StatusHandlerInput
): StatusHandlerResult {
  const { response, axiosConfig } = input;
  const method = (axiosConfig?.method || 'GET').toString().toUpperCase();
  const url = String(axiosConfig?.url || '');
  const status = response.status;

  const htmlCheck = detectHtmlErrorResponse(response?.data);
  if (htmlCheck.isHtml) {
    const msg = get2xxErrorContext(
      {
        statusCode: status,
        method,
        url,
        responseData: htmlCheck.preview,
        detectionReason: 'Received HTML instead of expedted JSON data.',
      },
      { characterBudget: 5000 }
    );
    return { shouldFail: true, message: msg };
  }

  const data = response?.data;
  if (!data || typeof data !== 'object') {
    return { shouldFail: false };
  }

  const d: any = Array.isArray(data) && data.length > 0 ? data[0] : data;
  if (!d || typeof d !== 'object') {
    return { shouldFail: false };
  }

  if (typeof d.code === 'number' && d.code >= 400 && d.code <= 599) {
    const msg = get2xxErrorContext(
      {
        statusCode: status,
        method,
        url,
        responseData: data,
        detectionReason: 'Response contains error code field',
        detectedValue: String(d.code)
      },
      { characterBudget: 5000 }
    );
    return { shouldFail: true, message: msg };
  }

  if (typeof d.status === 'number' && d.status >= 400 && d.status <= 599) {
    const msg = get2xxErrorContext(
      {
        statusCode: status,
        method,
        url,
        responseData: data,
        detectionReason: 'Response contains error status field',
        detectedValue: String(d.status)
      },
      { characterBudget: 5000 }
    );
    return { shouldFail: true, message: msg };
  }

  const errorKeys = new Set(['error', 'errors', 'error_message', 'errormessage', 'failure_reason', 'failure', 'failed']);
  const maxDepth = 2;

  const checkForErrorKeys = (obj: any, depth: number): { found: boolean; key?: string; value?: string } => {
    if (!obj || typeof obj !== 'object') return { found: false };
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (errorKeys.has(lower)) {
        const v = obj[key];
        const isNonEmpty = Array.isArray(v)
          ? v.length > 0
          : (typeof v === 'string')
            ? v.trim() !== ''
            : (typeof v === 'boolean')
              ? v === true
              : (v && typeof v === 'object' && Object.keys(v).length > 0);
        if (isNonEmpty) {
          return { found: true, key, value: typeof v === 'string' ? v : undefined };
        }
      }
      const val = obj[key];
      if (depth < maxDepth && val && typeof val === 'object') {
        const nested = checkForErrorKeys(val, depth + 1);
        if (nested.found) return nested;
      }
    }
    return { found: false };
  };

  const errorCheck = checkForErrorKeys(d, 0);
  if (errorCheck.found) {
    const msg = get2xxErrorContext(
      {
        statusCode: status,
        method,
        url,
        responseData: data,
        detectionReason: `Response contains '${errorCheck.key}' field`,
        detectedValue: errorCheck.value
      },
      { characterBudget: 5000 }
    );
    return { shouldFail: true, message: msg };
  }
  return { shouldFail: false };
}

export function handle429Status(
  input: StatusHandlerInput
): StatusHandlerResult {
  const { response, axiosConfig, credentials = {}, payload = {} } = input;
  const method = (axiosConfig?.method || 'GET').toString().toUpperCase();
  const url = String(axiosConfig?.url || '');
  const errorData = response?.data instanceof Buffer ? response.data.toString('utf-8') : response?.data;
  const error = JSON.stringify((errorData as any)?.error || (errorData as any)?.errors || errorData || response?.statusText || "undefined");
  const maskedConfig = maskCredentials(JSON.stringify(axiosConfig || {}), credentials);
  let message = `${method} ${url} failed with status ${response.status}.\nResponse: ${String(error).slice(0, 1000)}\nconfig: ${maskedConfig}`;

  const retryAfter = response.headers['retry-after']
    ? `Retry-After: ${response.headers['retry-after']}`
    : 'No Retry-After header provided';
  message = `Rate limit exceeded. ${retryAfter}. Maximum wait time of 60s exceeded. \n        \n        ${message}`;
  const full = `API call failed with status ${response.status}. Response: ${message}`;
  return { shouldFail: true, message: full };
}

export function handleErrorStatus(
  input: StatusHandlerInput
): StatusHandlerResult {
  const { response, axiosConfig, payload = {}, retriesAttempted, lastFailureStatus } = input;
  const method = (axiosConfig?.method || 'GET').toString().toUpperCase();
  const url = String(axiosConfig?.url || '');
  const errorData = response?.data instanceof Buffer ? response.data.toString('utf-8') : response?.data;
  const status = response.status;

  if (status === 401 || status === 403) {
    const message = getAuthErrorContext(
      {
        statusCode: status,
        method,
        url,
        responseData: errorData,
        headers: axiosConfig.headers || {},
        allVariables: payload,
        retriesAttempted,
        lastFailureStatus
      },
      { characterBudget: 5000 }
    );
    return { shouldFail: true, message };
  }

  if (status >= 400 && status < 500) {
    const message = getClientErrorContext(
      {
        statusCode: status,
        method,
        url,
        responseData: errorData,
        requestConfig: {
          queryParams: axiosConfig.params,
          body: axiosConfig.data,
          headers: axiosConfig.headers
        },
        retriesAttempted,
        lastFailureStatus
      },
      { characterBudget: 5000 }
    );
    return { shouldFail: true, message };
  }

  const retryInfo = retriesAttempted ? ` (retries: ${retriesAttempted}${lastFailureStatus ? `, last failure: ${lastFailureStatus}` : ''})` : '';
  const error = JSON.stringify((errorData as any)?.error || (errorData as any)?.errors || errorData || response?.statusText || "undefined");
  const message = `${method} ${url} failed with status ${status}${retryInfo}.\nResponse: ${String(error).slice(0, 1000)}`;
  return { shouldFail: true, message };
}