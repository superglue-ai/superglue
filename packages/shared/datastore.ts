import { ApiConfig, ApiInput, ApiInputRequest, ExtractConfig, ExtractInput, RunResult, TransformConfig, TransformInput } from "./types.js";


export interface DataStore {
    // API Config Methods
    getApiConfig(id: string): Promise<ApiConfig | null>;
    listApiConfigs(limit?: number, offset?: number): Promise<{ items: ApiConfig[], total: number }>;
    upsertApiConfig(id: string, config: ApiConfig): Promise<ApiConfig>;
    deleteApiConfig(id: string): Promise<boolean>;
    
    getApiConfigFromRequest(request: ApiInput, payload: any): Promise<ApiConfig | null>;
    getTransformConfigFromRequest(request: TransformInput, payload: any): Promise<TransformConfig | null>;
    getExtractConfigFromRequest(request: ExtractInput, payload: any): Promise<ExtractConfig | null>;

    saveApiConfig(request: ApiInput, payload: any, config: ApiConfig): Promise<ApiConfig>;
    saveExtractConfig(request: ExtractInput, payload: any, config: ExtractConfig): Promise<ExtractConfig>;
    saveTransformConfig(request: TransformInput, payload: any, config: TransformConfig): Promise<TransformConfig>;

    // Extract Config Methods
    getExtractConfig(id: string): Promise<ExtractConfig | null>;
    listExtractConfigs(limit?: number, offset?: number): Promise<{ items: ExtractConfig[], total: number }>;
    upsertExtractConfig(id: string, config: ExtractConfig): Promise<ExtractConfig>;
    deleteExtractConfig(id: string): Promise<boolean>;
  
    // Transform Config Methods
    getTransformConfig(id: string): Promise<TransformConfig | null>;
    listTransformConfigs(limit?: number, offset?: number): Promise<{ items: TransformConfig[], total: number }>;
    upsertTransformConfig(id: string, config: TransformConfig): Promise<TransformConfig>;
    deleteTransformConfig(id: string): Promise<boolean>;
  
    // Run Result Methods
    getRun(id: string): Promise<RunResult | null>;
    listRuns(limit?: number, offset?: number, configId?: string): Promise<{ items: RunResult[], total: number }>;
    createRun(result: RunResult): Promise<RunResult>;
    deleteRun(id: string): Promise<boolean>;
  }
  