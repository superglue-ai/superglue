import { FileType, Integration, RequestOptions } from "@superglue/client";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import ivm from "isolated-vm";
import { server_defaults } from "../default.js";
import { CodeConfig } from "../generate/config.js";
import { Metadata } from "../graphql/types.js";
import { parseFile } from "../utils/file.js";
import { logMessage } from "../utils/logs.js";
import { maskCredentials } from "../utils/tools.js";
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
    const allResults: any[] = [];
    const hasPagination = !!codeConfig.pagination;
    const hasStopCondition = hasPagination && !!codeConfig.pagination?.stopCondition;
    const maxRequests = hasStopCondition ? server_defaults.MAX_PAGINATION_REQUESTS : 500;
    
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

        if (hasStopCondition) {
            await handlePaginationWithStopCondition(
                responseData,
                lastResponse,
                paginationState,
                allResults,
                codeConfig,
                axiosConfig,
                credentials
            );
        } else {
            handleLegacyPagination(
                responseData,
                paginationState,
                allResults,
                codeConfig.pagination!.pageSize
            );
        }

        if (codeConfig.pagination!.type === "CURSOR_BASED") {
            const cursorPath = codeConfig.pagination!.cursorPath || 'next_cursor';
            const nextCursor = extractCursorFromResponse(responseData, cursorPath);
            updatePaginationState(paginationState, codeConfig.pagination!.type, codeConfig.pagination!.pageSize, nextCursor);
        } else {
            updatePaginationState(paginationState, codeConfig.pagination!.type, codeConfig.pagination!.pageSize, null);
        }

        paginationState.loopCounter++;
    }

    return formatFinalResult(
        allResults,
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

function extractCursorFromResponse(responseData: any, cursorPath: string): any {
    const cursorParts = cursorPath.split('.');
    let cursor = responseData;
    for (const part of cursorParts) {
        cursor = cursor?.[part];
    }
    return cursor;
}

function detectPaginationErrors(
    loopCounter: number,
    currentResponseHash: string,
    firstResponseHash: string | null,
    hasValidData: boolean,
    currentHasData: boolean,
    axiosConfig: AxiosRequestConfig,
    credentials: Record<string, any>,
    stopCondition: string
): void {
    if (loopCounter === 1 && currentResponseHash === firstResponseHash && hasValidData && currentHasData) {
        const maskedConfig = maskCredentials(JSON.stringify(axiosConfig), credentials);
        throw new Error(
            `Pagination configuration error: The first two API requests returned identical responses. ` +
            `The pagination state is not being applied correctly in your code function. ` +
            `Config: ${maskedConfig}`
        );
    }

    if (loopCounter === 1 && !hasValidData && !currentHasData) {
        throw new Error(
            `Stop condition error: The API returned no data on the first request, but the stop condition did not terminate pagination. ` +
            `Current stop condition: ${stopCondition}`
        );
    }
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


function checkResponseHasData(responseData: any): boolean {
    if (Array.isArray(responseData)) {
        return responseData.length > 0;
    }
    return responseData && Object.keys(responseData).length > 0;
}

async function handlePaginationWithStopCondition(
    responseData: any,
    response: AxiosResponse,
    paginationState: PaginationState,
    allResults: any[],
    codeConfig: CodeConfig,
    axiosConfig: AxiosRequestConfig,
    credentials: Record<string, any>
): Promise<void> {
    const currentResponseHash = JSON.stringify(responseData);
    const currentHasData = checkResponseHasData(responseData);

    if (paginationState.loopCounter === 0) {
        paginationState.firstResponseHash = currentResponseHash;
        paginationState.hasValidData = currentHasData;
    }

    detectPaginationErrors(
        paginationState.loopCounter,
        currentResponseHash,
        paginationState.firstResponseHash,
        paginationState.hasValidData,
        currentHasData,
        axiosConfig,
        credentials,
        codeConfig.pagination!.stopCondition
    );

    if (paginationState.loopCounter > 1 && currentResponseHash === paginationState.previousResponseHash) {
        paginationState.hasMore = false;
    } else {
        const pageInfo = {
            page: paginationState.page,
            offset: paginationState.offset,
            cursor: paginationState.cursor,
            totalFetched: allResults.length,
            limit: codeConfig.pagination!.pageSize,
            pageSize: codeConfig.pagination!.pageSize
        };

        const stopEval = await evaluateStopCondition(
            codeConfig.pagination!.stopCondition,
            response,
            pageInfo
        );

        if (stopEval.error) {
            throw new Error(
                `Pagination stop condition error: ${stopEval.error}\n` +
                `Stop condition: ${codeConfig.pagination!.stopCondition}`
            );
        }

        paginationState.hasMore = !stopEval.shouldStop;
    }

    paginationState.previousResponseHash = currentResponseHash;

    if (Array.isArray(responseData)) {
        allResults.push(...responseData);
    } else if (responseData) {
        allResults.push(responseData);
    }
}

function handleLegacyPagination(
    responseData: any,
    paginationState: PaginationState,
    allResults: any[],
    pageSize: string
): void {
    if (Array.isArray(responseData)) {
        const parsedPageSize = parseInt(pageSize || "50");
        if (!parsedPageSize || responseData.length < parsedPageSize) {
            paginationState.hasMore = false;
        }
        allResults.push(...responseData);
    } else if (responseData) {
        allResults.push(responseData);
        paginationState.hasMore = false;
    } else {
        paginationState.hasMore = false;
    }
}

function formatFinalResult(
    allResults: any[],
    paginationType: string,
    cursor: any,
    lastResponse: AxiosResponse
): ExecutionResult {
    if (paginationType === "CURSOR_BASED") {
        return {
            data: {
                next_cursor: cursor,
                ...(Array.isArray(allResults) ? { results: allResults } : allResults)
            },
            statusCode: lastResponse.status,
            headers: lastResponse.headers as Record<string, any>
        };
    }

    return {
        data: allResults.length === 1 ? allResults[0] : allResults,
        statusCode: lastResponse.status,
        headers: lastResponse.headers as Record<string, any>
    };
}

async function evaluateStopCondition(
    stopConditionCode: string,
    response: AxiosResponse,
    pageInfo: { page: number; offset: number; cursor: any; totalFetched: number; limit: string; pageSize: string }
): Promise<{ shouldStop: boolean; error?: string }> {
    const isolate = new ivm.Isolate({ memoryLimit: 128 });

    try {
        const context = await isolate.createContext();

        await context.global.set('responseJSON', JSON.stringify({ data: response.data, headers: response.headers }));
        await context.global.set('pageInfoJSON', JSON.stringify(pageInfo));

        const wrappedCode = wrapStopConditionCode(stopConditionCode);

        const script = `
            const response = JSON.parse(responseJSON);
            const pageInfo = JSON.parse(pageInfoJSON);
            const fn = ${wrappedCode};
            const result = fn(response, pageInfo);
            return Boolean(result);
        `;

        const shouldStop = await context.evalClosure(script, [], { timeout: 3000 });

        return { shouldStop: Boolean(shouldStop) };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            shouldStop: true,
            error: `Stop condition evaluation failed: ${errorMessage}`
        };
    } finally {
        disposeIsolate(isolate);
    }
}


