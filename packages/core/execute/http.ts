import { FileType, RequestOptions } from "@superglue/client";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import https from 'https';
import { server_defaults } from "../default.js";
import { parseFile } from "../utils/file.js";
import { parseJSON } from "../utils/json-parser.js";
import { logMessage } from "../utils/logs.js";
import { maskCredentials } from "../utils/tools.js";

export interface HttpExecutorInput {
    axiosConfig: AxiosRequestConfig;
    inputData: Record<string, any>;
    credentials: Record<string, any>;
    options: RequestOptions;
}

export interface HttpExecutorResult {
    data: any;
    response: AxiosResponse;
}

export async function executeHttp(input: HttpExecutorInput): Promise<HttpExecutorResult> {
    const { axiosConfig, inputData, credentials, options } = input;
    
    const axiosResult = await callAxios(axiosConfig, options);
    const response = axiosResult.response;
    
    if (response.data instanceof Buffer) {
        response.data = await parseFile(response.data, FileType.AUTO);
    }
    else if (response.data && (response.data instanceof ArrayBuffer)) {
        response.data = await parseFile(Buffer.from(response.data), FileType.AUTO);
    }
    else if (response.data && typeof response.data === 'string') {
        response.data = await parseFile(Buffer.from(response.data), FileType.AUTO);
    }

    handleResponseStatus({
        response,
        axiosConfig,
        credentials,
        payload: inputData,
        retriesAttempted: axiosResult.retriesAttempted || 0,
        lastFailureStatus: axiosResult.lastFailureStatus
    });

    return { data: response.data, response };
}

function handleResponseStatus(statusHandlerInput: {
    response: AxiosResponse;
    axiosConfig: AxiosRequestConfig;
    credentials: Record<string, any>;
    payload: Record<string, any>;
    retriesAttempted: number;
    lastFailureStatus?: number;
}): void {
    const status = statusHandlerInput.response.status;
    let statusHandlerResult = null;

    if ([200, 201, 202, 203, 204, 205].includes(status)) {
        statusHandlerResult = handle2xxStatus(statusHandlerInput);
    } else if (status === 429) {
        statusHandlerResult = handle429Status(statusHandlerInput);
    } else {
        const base = handleErrorStatus(statusHandlerInput);
        if (base.shouldFail && base.message) {
            const suffix = `\nRetries attempted: ${statusHandlerInput.retriesAttempted}${statusHandlerInput.lastFailureStatus ? `; last failure status: ${statusHandlerInput.lastFailureStatus}` : ''}`;
            statusHandlerResult = { shouldFail: true, message: `${base.message}${suffix}` };
        } else {
            statusHandlerResult = base;
        }
    }

    if (statusHandlerResult.shouldFail) {
        throw new ApiCallError(statusHandlerResult.message, status);
    }
}

export interface CallAxiosResult {
    response: AxiosResponse;
    retriesAttempted: number;
    lastFailureStatus?: number;
}

export async function callAxios(config: AxiosRequestConfig, options: RequestOptions): Promise<CallAxiosResult> {
    let retryCount = 0;
    const maxRetries = options?.retries ?? 1;
    const delay = options?.retryDelay || server_defaults.AXIOS_DEFAULT_RETRY_DELAY_MS;
    const maxRateLimitWaitMs = server_defaults.AXIOS_MAX_RATE_LIMIT_WAIT_MS;
    let rateLimitRetryCount = 0;
    let totalRateLimitWaitTime = 0;
    let lastFailureStatus: number | undefined;

    config.headers = {
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        ...config.headers,
    };

    if (["GET", "HEAD", "DELETE", "OPTIONS"].includes(config.method!) || !config.data) {
        config.data = undefined;
    }
    else if (config.data && typeof config.data === 'string' && config.data.trim().startsWith("{")) {
        try {
            config.data = parseJSON(config.data);
        } catch (error) { }
    }

    do {
        let response: AxiosResponse | null = null;
        try {
            const startTs = Date.now();
            response = await axios({
                ...config,
                timeout: options?.timeout || server_defaults.AXIOS_DEFAULT_TIMEOUT_MS,
                responseType: 'arraybuffer',
                validateStatus: null,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                decompress: true,
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false
                })
            });
            const durationMs = Date.now() - startTs;

            if (response.status === 429) {

                let waitTime = 0;
                if (response.headers['retry-after']) {
                    const retryAfter = response.headers['retry-after'];
                    if (/^\d+$/.test(retryAfter)) {
                        waitTime = parseInt(retryAfter, 10) * 1000;
                    } else {
                        const retryDate = new Date(retryAfter);
                        waitTime = retryDate.getTime() - Date.now();
                    }
                } else {
                    waitTime = Math.min(Math.pow(10, rateLimitRetryCount) * 1000 + Math.random() * 100, 3600000);
                }

                if (totalRateLimitWaitTime + waitTime > maxRateLimitWaitMs) {
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
                if (response.status !== 429 && retryCount < maxRetries && durationMs < server_defaults.AXIOS_QUICK_RETRY_THRESHOLD_MS) {
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
    } while (retryCount <= maxRetries || rateLimitRetryCount > 0);
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
    const MAX_HTML_CHECK_BYTES = 1024;
    let dataPrefix = '';

    if (data instanceof Buffer) {
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


export type StatusHandlerInput = {
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
    const { response, axiosConfig, credentials = {}, payload = {} } = input;
    
    const htmlCheck = detectHtmlErrorResponse(response?.data);
    if (htmlCheck.isHtml) {
        const url = String(axiosConfig?.url || '');
        const maskedUrl = maskCredentials(url, credentials);
        const msg = `Received HTML response instead of expected JSON data from ${maskedUrl}. \n        This usually indicates an error page or invalid endpoint.\nResponse: ${htmlCheck.preview}`;
        return { shouldFail: true, message: msg };
    }

    const data = response.data;
    if (!data || typeof data !== 'object') {
        return { shouldFail: false };
    }

    const d: any = Array.isArray(data) && data.length > 0 ? data[0] : data;
    if (!d || typeof d !== 'object') {
        return { shouldFail: false };
    }

    const buildErrorMessage = (reason: string, value?: any) => {
        const method = (axiosConfig?.method || 'GET').toString().toUpperCase();
        const url = String(axiosConfig?.url || '');
        const maskedConfig = maskCredentials(JSON.stringify(axiosConfig || {}), credentials);
        const previewSource = JSON.stringify(data);
        const preview = String(previewSource).slice(0, 2500);
        const valueStr = value !== undefined ? `='${String(value).slice(0, 120)}'` : '';
        return `${method} ${url} returned ${response.status} but appears to be an error. Reason: ${reason}${valueStr}\nResponse preview: ${preview}\nconfig: ${maskedConfig}`;
    };

    if (typeof d.code === 'number' && d.code >= 400 && d.code <= 599) {
        return { shouldFail: true, message: buildErrorMessage('code', d.code) };
    }
    if (typeof d.status === 'number' && d.status >= 400 && d.status <= 599) {
        return { shouldFail: true, message: buildErrorMessage('status', d.status) };
    }

    const errorKeys = new Set(['error', 'errors', 'error_message', 'errormessage', 'failure_reason', 'failure', 'failed', 'error message']);
    const maxDepth = 2;

    const checkForErrors = (obj: any, depth: number): { hasError: boolean; key?: string; value?: any } => {
        if (!obj || typeof obj !== 'object') return { hasError: false };
        
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
                    return { hasError: true, key: `${key} key detected at depth ${depth}`, value: typeof v === 'string' ? v : undefined };
                }
            }
            
            const val = obj[key];
            if (depth < maxDepth && val && typeof val === 'object') {
                const result = checkForErrors(val, depth + 1);
                if (result.hasError) return result;
            }
        }
        return { hasError: false };
    };

    const errorCheck = checkForErrors(d, 0);
    if (errorCheck.hasError) {
        return { shouldFail: true, message: buildErrorMessage(errorCheck.key!, errorCheck.value) };
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
    const { response, axiosConfig, credentials = {}, payload = {} } = input;
    const method = (axiosConfig?.method || 'GET').toString().toUpperCase();
    const url = String(axiosConfig?.url || '');
    const errorData = response?.data instanceof Buffer ? response.data.toString('utf-8') : response?.data;
    const error = JSON.stringify((errorData as any)?.error || (errorData as any)?.errors || errorData || response?.statusText || "undefined");
    const maskedConfig = maskCredentials(JSON.stringify(axiosConfig || {}), credentials);
    const message = `${method} ${url} failed with status ${response.status}.\nResponse: ${String(error).slice(0, 1000)}\nconfig: ${maskedConfig}`;
    const full = `API call failed with status ${response.status}. Response: ${message}`;
    return { shouldFail: true, message: full };
}

