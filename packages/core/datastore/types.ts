import type { ApiConfig, ExtractConfig, RunResult, TransformConfig, Workflow, Integration } from "@superglue/client";
export interface DataStore {
  // API Config Methods
  getApiConfig(id: string, orgId?: string): Promise<ApiConfig | null>;
  listApiConfigs(limit?: number, offset?: number, orgId?: string): Promise<{ items: ApiConfig[], total: number }>;
  upsertApiConfig(id: string, config: ApiConfig, orgId?: string): Promise<ApiConfig>;
  deleteApiConfig(id: string, orgId?: string): Promise<boolean>;

  // Extract Config Methods
  getExtractConfig(id: string, orgId?: string): Promise<ExtractConfig | null>;
  listExtractConfigs(limit?: number, offset?: number, orgId?: string): Promise<{ items: ExtractConfig[], total: number }>;
  upsertExtractConfig(id: string, config: ExtractConfig, orgId?: string): Promise<ExtractConfig>;
  deleteExtractConfig(id: string, orgId?: string): Promise<boolean>;

  // Transform Config Methods
  getTransformConfig(id: string, orgId?: string): Promise<TransformConfig | null>;
  listTransformConfigs(limit?: number, offset?: number, orgId?: string): Promise<{ items: TransformConfig[], total: number }>;
  upsertTransformConfig(id: string, config: TransformConfig, orgId?: string): Promise<TransformConfig>;
  deleteTransformConfig(id: string, orgId?: string): Promise<boolean>;

  // Run Result Methods
  getRun(id: string, orgId?: string): Promise<RunResult | null>;
  listRuns(limit?: number, offset?: number, configId?: string, orgId?: string): Promise<{ items: RunResult[], total: number }>;
  createRun(result: RunResult, orgId?: string): Promise<RunResult>;
  deleteRun(id: string, orgId?: string): Promise<boolean>;
  deleteAllRuns(orgId?: string): Promise<boolean>;

  // Workflow Methods
  getWorkflow(id: string, orgId?: string): Promise<Workflow | null>;
  listWorkflows(limit?: number, offset?: number, orgId?: string): Promise<{ items: Workflow[], total: number }>;
  upsertWorkflow(id: string, workflow: Workflow, orgId?: string): Promise<Workflow>;
  deleteWorkflow(id: string, orgId?: string): Promise<boolean>;

  // Tenant Information Methods
  getTenantInfo(): Promise<{ email: string | null, emailEntrySkipped: boolean }>;
  setTenantInfo(email?: string, emailEntrySkipped?: boolean): Promise<void>;

  // Integration Methods
  getIntegration(id: string, orgId?: string): Promise<Integration | null>;
  listIntegrations(limit?: number, offset?: number, orgId?: string): Promise<{ items: Integration[], total: number }>;
  upsertIntegration(id: string, integration: Integration, orgId?: string): Promise<Integration>;
  deleteIntegration(id: string, orgId?: string): Promise<boolean>;
}
