import type {
  ApiConfig,
  DiscoveryRun,
  FileReference,
  FileStatus,
  System,
  Run,
  RunStatus,
  Tool,
  ToolSchedule,
} from "@superglue/shared";

export type PrometheusRunStatusLabel = "success" | "failed" | "aborted";
export type PrometheusRunSourceLabel =
  | "api"
  | "frontend"
  | "scheduler"
  | "mcp"
  | "tool-chain"
  | "webhook";

export type PrometheusRunMetrics = {
  runsTotal: Array<{
    status: PrometheusRunStatusLabel;
    source: PrometheusRunSourceLabel;
    value: number;
  }>;
  runDurationSecondsP95: Array<{
    source: PrometheusRunSourceLabel;
    windowSeconds: number;
    value: number;
  }>;
};

export interface DataStore {
  // API Config Methods
  getApiConfig(params: { id: string; orgId?: string; }): Promise<ApiConfig | null>;
  listApiConfigs(params?: {
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: ApiConfig[]; total: number; }>;
  upsertApiConfig(params: { id: string; config: ApiConfig; orgId?: string; }): Promise<ApiConfig>;
  deleteApiConfig(params: { id: string; orgId?: string; }): Promise<boolean>;

  // Run Methods
  getRun(params: { id: string; orgId?: string; }): Promise<Run | null>;
  listRuns(params?: {
    limit?: number;
    offset?: number;
    configId?: string;
    status?: RunStatus;
    orgId?: string;
  }): Promise<{ items: Run[]; total: number; }>;
  createRun(params: { run: Run; }): Promise<Run>;
  updateRun(params: { id: string; orgId: string; updates: Partial<Run>; }): Promise<Run>;
  getPrometheusRunMetrics(params: {
    orgId: string;
    windowSeconds: number;
  }): Promise<PrometheusRunMetrics>;

  // Workflow Methods
  getWorkflow(params: { id: string; orgId?: string; }): Promise<Tool | null>;
  listWorkflows(params?: {
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: Tool[]; total: number; }>;
  upsertWorkflow(params: {
    id: string;
    workflow: Tool;
    orgId?: string;
    userId?: string;
    userEmail?: string;
  }): Promise<Tool>;
  deleteWorkflow(params: { id: string; orgId?: string; }): Promise<boolean>;
  renameWorkflow(params: { oldId: string; newId: string; orgId?: string; }): Promise<Tool>;

  // Tool History Methods (Postgres-only, returns empty for other stores)
  listToolHistory(params: { toolId: string; orgId?: string; }): Promise<ToolHistoryEntry[]>;
  restoreToolVersion(params: {
    toolId: string;
    version: number;
    orgId?: string;
    userId?: string;
    userEmail?: string;
  }): Promise<Tool>;

  // Tenant Information Methods
  getTenantInfo(): Promise<{ email: string | null; emailEntrySkipped: boolean; }>;
  setTenantInfo(params?: { email?: string; emailEntrySkipped?: boolean; }): Promise<void>;

  // System Methods
  getSystem(params: { id: string; includeDocs?: boolean; orgId?: string; }): Promise<System | null>;
  listSystems(params?: {
    limit?: number;
    offset?: number;
    includeDocs?: boolean;
    orgId?: string;
  }): Promise<{ items: System[]; total: number; }>;
  upsertSystem(params: { id: string; system: System; orgId?: string; }): Promise<System>;
  deleteSystem(params: { id: string; orgId?: string; }): Promise<boolean>;
  getManySystems(params: {
    ids: string[];
    includeDocs?: boolean;
    orgId?: string;
  }): Promise<System[]>;
  getTemplateOAuthCredentials(params: {
    templateId: string;
  }): Promise<{ client_id: string; client_secret: string; } | null>;

  // OAuth cache methods
  cacheOAuthSecret(params: {
    uid: string;
    clientId: string;
    clientSecret: string;
    ttlMs: number;
  }): Promise<void>;
  getOAuthSecret(params: {
    uid: string;
  }): Promise<{ clientId: string; clientSecret: string; } | null>;
  copyTemplateDocumentationToUserSystem(params: {
    templateId: string;
    userSystemId: string;
    orgId?: string;
  }): Promise<boolean>;

  // Tool Schedules
  listToolSchedules(params: { toolId?: string; orgId: string; }): Promise<ToolScheduleInternal[]>;
  getToolSchedule(params: { id: string; orgId?: string; }): Promise<ToolScheduleInternal | null>;
  upsertToolSchedule(params: { schedule: ToolScheduleInternal; }): Promise<void>;
  deleteToolSchedule(params: { id: string; orgId: string; }): Promise<boolean>;
  listDueToolSchedules(): Promise<ToolScheduleInternal[]>;
  updateScheduleNextRun(params: { id: string; nextRunAt: Date; lastRunAt: Date; }): Promise<boolean>;

  // DiscoveryRun Methods
  createDiscoveryRun(params: { run: DiscoveryRun; orgId?: string; }): Promise<DiscoveryRun>;
  getDiscoveryRun(params: { id: string; orgId?: string; }): Promise<DiscoveryRun | null>;
  updateDiscoveryRun(params: {
    id: string;
    updates: Partial<DiscoveryRun>;
    orgId?: string;
  }): Promise<DiscoveryRun>;
  listDiscoveryRuns(params?: {
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: DiscoveryRun[]; total: number; }>;
  deleteDiscoveryRun(params: { id: string; orgId?: string; }): Promise<boolean>;

  // FileReference Methods
  createFileReference(params: { file: FileReference; orgId?: string; }): Promise<FileReference>;
  getFileReference(params: { id: string; orgId?: string; }): Promise<FileReference | null>;
  updateFileReference(params: {
    id: string;
    updates: Partial<FileReference>;
    orgId?: string;
  }): Promise<FileReference>;
  listFileReferences(params?: {
    fileIds?: string[];
    status?: FileStatus;
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: FileReference[]; total: number; }>;
  deleteFileReference(params: { id: string; orgId?: string; }): Promise<boolean>;
}

export type ToolScheduleInternal = ToolSchedule & {
  orgId: string;
};

export type ToolHistoryEntry = {
  version: number;
  createdAt: Date;
  createdByUserId?: string;
  createdByEmail?: string;
  tool: Tool;
};