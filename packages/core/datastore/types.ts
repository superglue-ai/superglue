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
  DocumentationFiles,
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
    allowedToolIds?: string[];
    includeTotal?: boolean;
    search?: string;
    searchUserIds?: string[];
    startedAfter?: Date;
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
  getWorkflow(params: {
    id: string;
    orgId?: string;
    includeArchived?: boolean;
  }): Promise<Tool | null>;
  listWorkflows(params?: {
    limit?: number;
    offset?: number;
    orgId?: string;
    includeArchived?: boolean;
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
  getSystem(params: {
    id: string;
    includeDocs?: boolean;
    orgId?: string;
    environment?: "dev" | "prod";
  }): Promise<System | null>;
  listSystems(params?: {
    limit?: number;
    offset?: number;
    includeDocs?: boolean;
    orgId?: string;
    mode?: "dev" | "prod" | "all";
  }): Promise<{ items: System[]; total: number }>;
  createSystem(params: { system: System; orgId?: string }): Promise<System>;
  updateSystem(params: {
    id: string;
    system: Partial<System>;
    orgId?: string;
    environment?: "dev" | "prod";
  }): Promise<System | null>;
  upsertSystem(params: {
    id: string;
    system: System;
    orgId?: string;
    environment?: "dev" | "prod";
  }): Promise<System>;
  updateSystemDocumentationFiles(params: {
    id: string;
    documentationFiles: DocumentationFiles;
    orgId?: string;
  }): Promise<void>;
  deleteSystem(params: {
    id: string;
    orgId?: string;
    environment?: "dev" | "prod";
  }): Promise<boolean>;
  hasOtherSystemEnvironments(params: {
    id: string;
    excludeEnvironment: "dev" | "prod";
    orgId?: string;
  }): Promise<boolean>;
  getManySystems(params: {
    ids: string[];
    includeDocs?: boolean;
    orgId?: string;
    environment?: "dev" | "prod";
  }): Promise<System[]>;
  getTemplateOAuthCredentials(params: {
    templateId: string;
  }): Promise<{ client_id: string; client_secret: string } | null>;
  hasLinkedNonProdSystems(params: { orgId?: string }): Promise<boolean>;

  // OAuth cache methods
  cacheOAuthSecret(params: {
    uid: string;
    orgId: string;
    clientId: string;
    clientSecret: string;
    ttlMs: number;
  }): Promise<void>;
  getOAuthSecret(params: {
    uid: string;
    orgId: string;
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
  updateApiKey(params: UpdateApiKeyParams): Promise<ApiKeyRecord | null>;
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
  userId: string;
  createdByUserId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyParams {
  orgId: string;
  createdByUserId: string;
  key?: string;
  userId: string;
}

export interface UpdateApiKeyParams {
  id: string;
  orgId: string;
  isActive?: boolean;
}
