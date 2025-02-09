import { ApiConfig, ApiInput, ExtractConfig, ExtractInput, RunResult, TransformConfig, TransformInput } from "./types.js";


export interface DataStore {
    // API Config Methods
    getApiConfig(id: string, orgId?: string): Promise<ApiConfig | null>;
    listApiConfigs(limit?: number, offset?: number, orgId?: string): Promise<{ items: ApiConfig[], total: number }>;
    upsertApiConfig(id: string, config: ApiConfig, orgId?: string): Promise<ApiConfig>;
    deleteApiConfig(id: string, orgId?: string): Promise<void>;
    
    getApiConfigFromRequest(request: ApiInput, payload: any, orgId?: string): Promise<ApiConfig | null>;
    getTransformConfigFromRequest(request: TransformInput, payload: any, orgId?: string): Promise<TransformConfig | null>;
    getExtractConfigFromRequest(request: ExtractInput, payload: any, orgId?: string): Promise<ExtractConfig | null>;

    saveApiConfig(request: ApiInput, payload: any, config: ApiConfig, orgId?: string): Promise<ApiConfig>;
    saveExtractConfig(request: ExtractInput, payload: any, config: ExtractConfig, orgId?: string): Promise<ExtractConfig>;
    saveTransformConfig(request: TransformInput, payload: any, config: TransformConfig, orgId?: string): Promise<TransformConfig>;

    // Extract Config Methods
    getExtractConfig(id: string, orgId?: string): Promise<ExtractConfig | null>;
    listExtractConfigs(limit?: number, offset?: number, orgId?: string): Promise<{ items: ExtractConfig[], total: number }>;
    upsertExtractConfig(id: string, config: ExtractConfig, orgId?: string): Promise<ExtractConfig>;
    deleteExtractConfig(id: string, orgId?: string): Promise<void>;
  
    // Transform Config Methods
    getTransformConfig(id: string, orgId?: string): Promise<TransformConfig | null>;
    listTransformConfigs(limit?: number, offset?: number, orgId?: string): Promise<{ items: TransformConfig[], total: number }>;
    upsertTransformConfig(id: string, config: TransformConfig, orgId?: string): Promise<TransformConfig>;
    deleteTransformConfig(id: string, orgId?: string): Promise<void>;
  
    // Run Result Methods
    getRun(id: string, orgId?: string): Promise<RunResult | null>;
    listRuns(limit?: number, offset?: number, orgId?: string, configId?: string): Promise<{ items: RunResult[], total: number }>;
    createRun(result: RunResult, orgId?: string): Promise<RunResult>;
    deleteRun(id: string, orgId?: string): Promise<void>;
    deleteAllRuns(orgId?: string): Promise<void>;
  }
  