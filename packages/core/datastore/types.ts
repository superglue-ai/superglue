import type {
  DiscoveryRun,
  FileReference,
  FileStatus,
  OrgSettings,
  RequestSource,
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
  // Initialization
  ready(): Promise<void>;

  // Run Methods
  getRun(params: { id: string; orgId?: string }): Promise<Run | null>;
  listRuns(params?: {
    limit?: number;
    offset?: number;
    configId?: string;
    status?: RunStatus;
    requestSources?: RequestSource[];
    orgId?: string;
    userId?: string;
    systemId?: string;
  }): Promise<{ items: Run[]; total: number }>;
  createRun(params: { run: Run; orgId?: string }): Promise<Run>;
  updateRun(params: { id: string; orgId: string; updates: Partial<Run> }): Promise<Run>;
  getPrometheusRunMetrics(params: {
    orgId: string;
    windowSeconds: number;
  }): Promise<PrometheusRunMetrics>;

  // Workflow Methods
  getWorkflow(params: { id: string; orgId?: string }): Promise<Tool | null>;
  listWorkflows(params?: {
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: Tool[]; total: number }>;
  upsertWorkflow(params: {
    id: string;
    workflow: Tool;
    orgId?: string;
    userId?: string;
  }): Promise<Tool>;
  deleteWorkflow(params: { id: string; orgId?: string }): Promise<boolean>;
  renameWorkflow(params: { oldId: string; newId: string; orgId?: string }): Promise<Tool>;

  // Tool History Methods (Postgres-only, returns empty for other stores)
  listToolHistory(params: { toolId: string; orgId?: string }): Promise<ToolHistoryEntry[]>;
  restoreToolVersion(params: {
    toolId: string;
    version: number;
    orgId?: string;
    userId?: string;
  }): Promise<Tool>;

  // Tenant Information Methods
  getTenantInfo(): Promise<{ email: string | null; emailEntrySkipped: boolean }>;
  setTenantInfo(params?: { email?: string; emailEntrySkipped?: boolean }): Promise<void>;

  // System Methods
  getSystem(params: { id: string; includeDocs?: boolean; orgId?: string }): Promise<System | null>;
  listSystems(params?: {
    limit?: number;
    offset?: number;
    includeDocs?: boolean;
    orgId?: string;
  }): Promise<{ items: System[]; total: number }>;
  createSystem(params: { system: System; orgId?: string }): Promise<System>;
  updateSystem(params: {
    id: string;
    system: Partial<System>;
    orgId?: string;
  }): Promise<System | null>;
  upsertSystem(params: { id: string; system: System; orgId?: string }): Promise<System>;
  deleteSystem(params: { id: string; orgId?: string }): Promise<boolean>;
  getManySystems(params: {
    ids: string[];
    includeDocs?: boolean;
    orgId?: string;
  }): Promise<System[]>;
  getTemplateOAuthCredentials(params: {
    templateId: string;
  }): Promise<{ client_id: string; client_secret: string } | null>;

  // OAuth cache methods
  cacheOAuthSecret(params: {
    uid: string;
    clientId: string;
    clientSecret: string;
    ttlMs: number;
  }): Promise<void>;
  getOAuthSecret(params: {
    uid: string;
  }): Promise<{ clientId: string; clientSecret: string } | null>;
  copyTemplateDocumentationToUserSystem(params: {
    templateId: string;
    userSystemId: string;
    orgId?: string;
  }): Promise<boolean>;

  // Tool Schedules
  listToolSchedules(params: { toolId?: string; orgId: string }): Promise<ToolScheduleInternal[]>;
  getToolSchedule(params: { id: string; orgId?: string }): Promise<ToolScheduleInternal | null>;
  upsertToolSchedule(params: { schedule: ToolScheduleInternal }): Promise<void>;
  deleteToolSchedule(params: { id: string; orgId: string }): Promise<boolean>;
  listDueToolSchedules(): Promise<ToolScheduleInternal[]>;
  updateScheduleNextRun(params: { id: string; nextRunAt: Date; lastRunAt: Date }): Promise<boolean>;

  // DiscoveryRun Methods
  createDiscoveryRun(params: { run: DiscoveryRun; orgId?: string }): Promise<DiscoveryRun>;
  getDiscoveryRun(params: { id: string; orgId?: string }): Promise<DiscoveryRun | null>;
  updateDiscoveryRun(params: {
    id: string;
    updates: Partial<DiscoveryRun>;
    orgId?: string;
  }): Promise<DiscoveryRun>;
  listDiscoveryRuns(params?: {
    limit?: number;
    offset?: number;
    orgId?: string;
  }): Promise<{ items: DiscoveryRun[]; total: number }>;
  deleteDiscoveryRun(params: { id: string; orgId?: string }): Promise<boolean>;

  // FileReference Methods
  createFileReference(params: { file: FileReference; orgId?: string }): Promise<FileReference>;
  getFileReference(params: { id: string; orgId?: string }): Promise<FileReference | null>;
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
  }): Promise<{ items: FileReference[]; total: number }>;
  deleteFileReference(params: { id: string; orgId?: string }): Promise<boolean>;

  // Org Settings Methods
  getOrgSettings(params: { orgId: string }): Promise<OrgSettings | null>;
  upsertOrgSettings(params: {
    orgId: string;
    settings: Partial<OrgSettings>;
  }): Promise<OrgSettings>;
  listAllOrgSettings(): Promise<OrgSettings[]>;

  // Run Methods for Notification Summaries
  listRunsForPeriod(params: {
    orgId: string;
    startTime: Date;
    endTime: Date;
    requestSources?: RequestSource[];
  }): Promise<{ items: Run[]; total: number }>;

  // API Key Methods
  listApiKeys(params: { orgId: string }): Promise<ApiKeyRecord[]>;
  getApiKeyByKey(params: { key: string }): Promise<ApiKeyRecord | null>;
  createApiKey(params: CreateApiKeyParams): Promise<ApiKeyRecord>;
  updateApiKey(params: {
    id: string;
    orgId: string;
    isActive?: boolean;
    isRestricted?: boolean;
    userId?: string;
  }): Promise<ApiKeyRecord | null>;
  deleteApiKey(params: { id: string; orgId: string }): Promise<boolean>;
  deleteApiKeysByUserId(params: { userId: string; orgId: string }): Promise<void>;
}

export type ToolScheduleInternal = ToolSchedule & {
  orgId: string;
};

export type ToolHistoryEntry = {
  version: number;
  createdAt: Date;
  createdByUserId?: string;
  tool: Tool;
};

// API Key types
export interface ApiKeyRecord {
  id: string;
  orgId: string;
  key: string;
  userId?: string; // For end-user keys
  createdByUserId?: string; // Who created this key
  mode: "frontend" | "backend";
  isActive: boolean;
  isRestricted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyParams {
  orgId: string;
  createdByUserId: string;
  isRestricted: boolean;
  key?: string; // Optional - will be generated if not provided
  userId?: string;
  mode?: "frontend" | "backend";
}
