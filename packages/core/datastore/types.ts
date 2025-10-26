import type { ApiConfig, Integration, RunResult, Workflow, WorkflowSchedule } from "@superglue/client";

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
  getWorkflow(params: { id: string; orgId?: string }): Promise<Workflow | null>;
  listWorkflows(params?: { limit?: number; offset?: number; orgId?: string }): Promise<{ items: Workflow[], total: number }>;
  upsertWorkflow(params: { id: string; workflow: Workflow; orgId?: string }): Promise<Workflow>;
  deleteWorkflow(params: { id: string; orgId?: string }): Promise<boolean>;
  getManyWorkflows(params: { ids: string[]; orgId?: string }): Promise<Workflow[]>;

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
  listWorkflowSchedules(params: { workflowId: string, orgId: string }): Promise<WorkflowScheduleInternal[]>;
  getWorkflowSchedule(params: { id: string; orgId?: string }): Promise<WorkflowScheduleInternal | null>;
  upsertWorkflowSchedule(params: { schedule: WorkflowScheduleInternal })
  deleteWorkflowSchedule(params: { id: string, orgId: string }): Promise<boolean>;
  listDueWorkflowSchedules(): Promise<WorkflowScheduleInternal[]>;
  updateScheduleNextRun(params: { id: string; nextRunAt: Date; lastRunAt: Date; }): Promise<boolean>;
}

export type WorkflowScheduleInternal = WorkflowSchedule & {
  orgId: string;
}