import { RequestOptions } from "@superglue/client";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { Metadata } from "../graphql/types.js";
import { executeFtp } from "./ftp.js";
import { executeHttp } from "./http.js";
import { executePostgres } from "./postgres.js";

export type Protocol = 'http' | 'https' | 'ftp' | 'ftps' | 'sftp' | 'postgres' | 'postgresql';

export interface ProtocolExecutionResult {
    data: any;
    response: AxiosResponse;
}

export function detectProtocol(url: string): Protocol {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol.replace(':', '') as Protocol;
    } catch {
        return 'http';
    }
}

export async function executeRequest({
    axiosConfig,
    inputData,
    credentials,
    options,
    metadata
}: {
    axiosConfig: AxiosRequestConfig;
    inputData: Record<string, any>;
    credentials: Record<string, any>;
    options: RequestOptions;
    metadata?: Metadata;
}): Promise<ProtocolExecutionResult> {
    const protocol = detectProtocol(axiosConfig.url || '');

    if (protocol === 'ftp' || protocol === 'ftps' || protocol === 'sftp') {
        return await executeFtp({ axiosConfig, credentials, options });
    }

    if (protocol === 'postgres' || protocol === 'postgresql') {
        return await executePostgres({ axiosConfig, inputData, credentials, options });
    }

    // HTTP(S) execution
    return await executeHttp({ axiosConfig, inputData, credentials, options });
}

