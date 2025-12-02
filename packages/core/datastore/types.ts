import type { ApiConfig, Integration, RunResult, Tool, ToolSchedule } from "@superglue/shared";

export interface DataStore {
  // API Config Methods
  getApiConfig(params: { id: string; orgId?: string }): Promise<ApiConfig | null>;
  listApiConfigs(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: ApiConfig[], total: number }>;
  upsertApiConfig(params: { id: string; config: ApiConfig; orgId?: string }): Promise<ApiConfig>;
  deleteApiConfig(params: { id: string; orgId?: string }): Promise<boolean>;

  // Run Result Methods
  getRun(params: { id: string; orgId?: string }): Promise<RunResult | null>;
  listRuns(params?: { limit?: number; offset?: number; configId?: string; orgId?: string }): Promise<{ items: RunResult[], total: number }>;
  createRun(params: { result: RunResult; orgId?: string }): Promise<RunResult>;
  deleteRun(params: { id: string; orgId?: string }): Promise<boolean>;
  deleteAllRuns(params?: { orgId?: string }): Promise<boolean>;

  // Workflow Methods
  getWorkflow(params: { id: string; orgId?: string }): Promise<Tool | null>;
  listWorkflows(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: Tool[], total: number }>;
  upsertWorkflow(params: { id: string; workflow: Tool; orgId?: string }): Promise<Tool>;
  deleteWorkflow(params: { id: string; orgId?: string }): Promise<boolean>;
  renameWorkflow(params: { oldId: string; newId: string; orgId?: string }): Promise<Tool>;
  getManyWorkflows(params: { ids: string[]; orgId?: string }): Promise<Tool[]>;

  // Tenant Information Methods
  getTenantInfo(): Promise<{ email: string | null, emailEntrySkipped: boolean }>;
  setTenantInfo(params?: { email?: string; emailEntrySkipped?: boolean }): Promise<void>;

  // Integration Methods
  getIntegration(params: { id: string; includeDocs?: boolean; orgId?: string }): Promise<Integration | null>;
  listIntegrations(params?: { limit?: number; offset?: number; includeDocs?: boolean; orgId?: string }): Promise<{ items: Integration[], total: number }>;
  upsertIntegration(params: { id: string; integration: Integration; orgId?: string }): Promise<Integration>;
  deleteIntegration(params: { id: string; orgId?: string }): Promise<boolean>;
  getManyIntegrations(params: { ids: string[]; includeDocs?: boolean; orgId?: string }): Promise<Integration[]>;
  getTemplateOAuthCredentials(params: { templateId: string }): Promise<{ client_id: string; client_secret: string } | null>;

  // OAuth cache methods
  cacheOAuthSecret(params: { uid: string; clientId: string; clientSecret: string; ttlMs: number }): Promise<void>;
  getOAuthSecret(params: { uid: string }): Promise<{ clientId: string; clientSecret: string } | null>;
  deleteOAuthSecret(params: { uid: string }): Promise<void>;
  copyTemplateDocumentationToUserIntegration(params: { templateId: string; userIntegrationId: string; orgId?: string }): Promise<boolean>;

  // Workflow Schedule
  listWorkflowSchedules(params: { workflowId: string, orgId: string }): Promise<ToolScheduleInternal[]>;
  getWorkflowSchedule(params: { id: string; orgId?: string }): Promise<ToolScheduleInternal | null>;
  upsertWorkflowSchedule(params: { schedule: ToolScheduleInternal })
  deleteWorkflowSchedule(params: { id: string, orgId: string }): Promise<boolean>;
  listDueWorkflowSchedules(): Promise<ToolScheduleInternal[]>;
  updateScheduleNextRun(params: { id: string; nextRunAt: Date; lastRunAt: Date; }): Promise<boolean>;
}

export type ToolScheduleInternal = ToolSchedule & {
  orgId: string;
}