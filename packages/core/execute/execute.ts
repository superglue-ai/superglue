import { FileType, Integration, RequestOptions } from "@superglue/client";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import ivm from "isolated-vm";
import { server_defaults } from "../default.js";
import { CodeConfig } from "../generate/config.js";
import { Metadata } from "../graphql/types.js";
import { parseFile } from "../utils/file.js";
import { logMessage } from "../utils/logs.js";
import { smartMergeResponses } from "../utils/tools.js";
import { ApiCallError } from "./http.js";
import { executeRequest } from "./protocol-executor.js";

interface CodeExecutionContext {
    inputData: Record<string, any>;
    credentials: Record<string, any>;
    paginationState?: {
        page: number;
        offset: number;
        cursor: any;
        limit: string;
        pageSize: string;
    };
}

interface PaginationState {
    page: number;
    offset: number;
    cursor: any;
    hasMore: boolean;
    loopCounter: number;
    previousResponseHash: string | null;
    firstResponseHash: string | null;
    hasValidData: boolean;
}

interface ExecutionResult {
    data: any;
    statusCode: number;
    headers: Record<string, any>;
}

function validateGeneratedUrl(axiosConfig: AxiosRequestConfig, integration?: Integration, metadata?: Metadata): void {
    if (!integration) {
        return; // No validation if no integration provided
    }

    try {
        const generatedUrl = new URL(axiosConfig.url || '');
        const allowedUrl = new URL(integration.urlHost);
        
        // Check if generated URL matches the integration's allowed host
        if (generatedUrl.hostname !== allowedUrl.hostname) {
            const error = `Security validation failed: Generated code attempted to access unauthorized host.\n` +
                `Expected: ${allowedUrl.hostname}\n` +
                `Generated: ${generatedUrl.hostname}`;
            logMessage('warn', error, metadata);        
        }
        else {
            logMessage('debug', `URL validation passed: ${generatedUrl.hostname}`, metadata);
        }
    } catch (error) {
        logMessage('warn', `URL validation skipped due to parse error: ${error}`, metadata);
    }
}

export async function executeCodeConfig({
    codeConfig,
    inputData,
    credentials,
    integration,
    options,
    metadata
}: {
    codeConfig: CodeConfig;
    inputData: Record<string, any>;
    credentials: Record<string, any>;
    integration?: Integration;
    options: RequestOptions;
    metadata?: Metadata;
}): Promise<ExecutionResult> {
    let mergedResult: any = null;
    const hasPagination = !!codeConfig.pagination;
    const maxRequests = server_defaults.MAX_PAGINATION_REQUESTS;
    
    const paginationState: PaginationState = {
        page: 1,
        offset: 0,
        cursor: null,
        hasMore: true,
        loopCounter: 0,
        previousResponseHash: null,
        firstResponseHash: null,
        hasValidData: false
    };

    let lastResponse: AxiosResponse | null = null;

    while (paginationState.hasMore && paginationState.loopCounter < maxRequests) {        
        const context: CodeExecutionContext = {
            inputData,
            credentials,
            paginationState: hasPagination ? {
                page: paginationState.page,
                offset: paginationState.offset,
                cursor: paginationState.cursor,
                limit: codeConfig.pagination!.pageSize,
                pageSize: codeConfig.pagination!.pageSize
            } : undefined
        };

        const axiosConfig = await executeCodeInIsolate(codeConfig.code, context, codeConfig);

        validateGeneratedUrl(axiosConfig, integration, metadata);

        logMessage('info', `${axiosConfig.method} ${axiosConfig.url}`, metadata);

        // Execute request (protocol detection and routing handled internally)
        const result = await executeRequest({
            axiosConfig,
            inputData,
            credentials,
            options,
            metadata
        });
        lastResponse = result.response;
        let responseData = await parseResponseData(result.data);

        if (!hasPagination) {
            return {
                data: responseData,
                statusCode: lastResponse.status,
                headers: lastResponse.headers as Record<string, any>
            };
        }

        // Merge response data
        mergedResult = smartMergeResponses(mergedResult, responseData);

        await handlePaginationWithHandler(
            responseData,
            lastResponse,
            paginationState,
            codeConfig
        );

        // Increment page/offset for pageInfo context in next iteration
        updatePaginationState(paginationState, codeConfig.pagination!.type, codeConfig.pagination!.pageSize, paginationState.cursor);

        paginationState.loopCounter++;
    }

    return formatFinalResult(
        mergedResult,
        codeConfig.pagination!.type,
        paginationState.cursor,
        lastResponse!
    );
}

function createMaskedContext(context: CodeExecutionContext): Record<string, any> {
    return {
        ...context,
        credentials: Object.keys(context.credentials).reduce(
            (acc, key) => ({ ...acc, [key]: '***' }), 
            {}
        )
    };
}

function wrapStopConditionCode(code: string): string {
    if (code.startsWith("return")) {
        return `(response, pageInfo) => { ${code} }`;
    }
    if (!code.startsWith("(response")) {
        return `(response, pageInfo) => ${code}`;
    }
    return code;
}

function wrapCodeFunction(code: string): string {
    if (!code.trim().startsWith('(context)')) {
        return `(context) => ${code}`;
    }
    return code;
}

function disposeIsolate(isolate: ivm.Isolate): void {
    try {
        isolate.dispose();
    } catch (error) {
        console.error("Error disposing isolate", error);
    }
}

async function executeCodeInIsolate(
    code: string,
    context: CodeExecutionContext,
    codeConfig: CodeConfig
): Promise<AxiosRequestConfig> {
    const isolate = new ivm.Isolate({ memoryLimit: 512 });
    
    try {
        const ivmContext = await isolate.createContext();

        await ivmContext.global.set('contextJSON', JSON.stringify(context));

        const wrappedCode = wrapCodeFunction(code);

        const script = `
            const context = JSON.parse(contextJSON);
            const fn = ${wrappedCode};
            const result = fn(context);
            return JSON.stringify(result);
        `;

        const resultJSON = await ivmContext.evalClosure(script, [], { timeout: 5000 });
        const axiosConfig = JSON.parse(resultJSON as string);
        
        if (!axiosConfig || typeof axiosConfig !== 'object') {
            throw new Error('Code function must return an object with { url, method, ... }');
        }
        if (!axiosConfig.url) {
            throw new Error('Code function must return config with url field');
        }
        if (!axiosConfig.method) {
            throw new Error('Code function must return config with method field');
        }

        return axiosConfig;
    } catch (error) {
        const maskedContext = createMaskedContext(context);
        throw new ApiCallError(
            `Code function execution failed: ${error instanceof Error ? error.message : String(error)}\n\nContext:\n${JSON.stringify(maskedContext, null, 2)}\n\nCode:\n${codeConfig.code}`,
            500
        );
    } finally {
        disposeIsolate(isolate);
    }
}


async function parseResponseData(responseData: any): Promise<any> {
    if (responseData instanceof Buffer) {
        return await parseFile(responseData, FileType.AUTO);
    }
    if (responseData instanceof ArrayBuffer) {
        return await parseFile(Buffer.from(responseData), FileType.AUTO);
    }
    if (typeof responseData === 'string') {
        return await parseFile(Buffer.from(responseData), FileType.AUTO);
    }
    return responseData;
}

function updatePaginationState(
    paginationState: PaginationState,
    paginationType: string,
    pageSize: string,
    cursor: any
): void {
    if (paginationType === "PAGE_BASED") {
        paginationState.page++;
    } else if (paginationType === "OFFSET_BASED") {
        paginationState.offset += parseInt(pageSize || "50");
    } else if (paginationType === "CURSOR_BASED") {
        paginationState.cursor = cursor;
        if (!cursor) {
            paginationState.hasMore = false;
        }
    }
}


async function handlePaginationWithHandler(
    responseData: any,
    response: AxiosResponse,
    paginationState: PaginationState,
    codeConfig: CodeConfig
): Promise<void> {
    // Calculate total fetched by checking the merged result size
    let totalFetched = 0;
    if (Array.isArray(responseData)) {
        totalFetched = paginationState.loopCounter * parseInt(codeConfig.pagination!.pageSize || "50");
    }

    const pageInfo = {
        page: paginationState.page,
        offset: paginationState.offset,
        cursor: paginationState.cursor,
        totalFetched,
        limit: codeConfig.pagination!.pageSize,
        pageSize: codeConfig.pagination!.pageSize
    };

    const handlerResult = await executePaginationHandler(
        codeConfig.pagination!.handler!,
        response,
        pageInfo
    );

    if (handlerResult.error) {
        throw new Error(
            `Pagination handler error: ${handlerResult.error}\n` +
            `Handler: ${codeConfig.pagination!.handler}`
        );
    }

    // Update pagination state
    paginationState.hasMore = handlerResult.hasMore;
    
    // Update cursor if provided (for cursor-based pagination)
    if (handlerResult.cursor !== undefined) {
        paginationState.cursor = handlerResult.cursor;
    }
}

function formatFinalResult(
    mergedResult: any,
    paginationType: string,
    cursor: any,
    lastResponse: AxiosResponse
): ExecutionResult {
    if (paginationType === "CURSOR_BASED") {
        return {
            data: {
                next_cursor: cursor,
                ...(Array.isArray(mergedResult) ? { results: mergedResult } : mergedResult)
            },
            statusCode: lastResponse.status,
            headers: lastResponse.headers as Record<string, any>
        };
    }

    return {
        data: mergedResult,
        statusCode: lastResponse.status,
        headers: lastResponse.headers as Record<string, any>
    };
}

async function executePaginationHandler(
    handlerCode: string,
    response: AxiosResponse,
    pageInfo: { page: number; offset: number; cursor: any; totalFetched: number; limit: string; pageSize: string }
): Promise<{ hasMore: boolean; cursor?: any; error?: string }> {
    const isolate = new ivm.Isolate({ memoryLimit: 128 });

    try {
        const context = await isolate.createContext();

        await context.global.set('responseJSON', JSON.stringify({ 
            data: response.data, 
            headers: response.headers,
            ...response.data  // Legacy support: allow direct access to response fields
        }));
        await context.global.set('pageInfoJSON', JSON.stringify(pageInfo));

        const wrappedCode = wrapStopConditionCode(handlerCode);

        const script = `
            const response = JSON.parse(responseJSON);
            const pageInfo = JSON.parse(pageInfoJSON);
            const fn = ${wrappedCode};
            const result = fn(response, pageInfo);
            return JSON.stringify(result);
        `;

        const resultJSON = await context.evalClosure(script, [], { timeout: 3000 });
        const result = JSON.parse(resultJSON as string);

        if (!result || typeof result !== 'object') {
            throw new Error('Handler must return an object with { hasMore, cursor? }');
        }
        if (typeof result.hasMore !== 'boolean') {
            throw new Error('Handler must return hasMore as a boolean');
        }

        return {
            hasMore: result.hasMore,
            cursor: result.cursor
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            hasMore: false,
            error: `Pagination handler evaluation failed: ${errorMessage}`
        };
    } finally {
        disposeIsolate(isolate);
    }
}
