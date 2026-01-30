export type ServiceMetadata = {
  traceId?: string;
  orgId?: string;
};

export interface Log {
  id: string;
  message: string;
  level: string | LogLevel;
  timestamp: Date;
  traceId?: string;
  orgId?: string;
}

export interface MessagePart {
  type: "content" | "tool";
  content?: string;
  tool?: ToolCall;
  id: string;
}

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: Date;
  tools?: ToolCall[];
  parts?: MessagePart[];
  isStreaming?: boolean;
  attachedFiles?: Array<{
    name: string;
    size?: number;
    key: string;
    status?: "processing" | "ready" | "error";
    error?: string;
  }>;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: any;
  output?: any;
  status:
    | "pending"
    | "awaiting_confirmation"
    | "running"
    | "completed"
    | "declined"
    | "stopped"
    | "error";
  error?: string;
  startTime?: Date;
  endTime?: Date;
  logs?: Array<{
    id: string;
    message: string;
    level: string;
    timestamp: Date;
    traceId?: string;
    orgId?: string;
  }>;
  buildResult?: any;
}

export enum UserRole {
  ADMIN = "admin",
  MEMBER = "member",
}

export enum SupportedFileType {
  JSON = "JSON",
  CSV = "CSV",
  XML = "XML",
  YAML = "YAML",
  EXCEL = "EXCEL",
  PDF = "PDF",
  DOCX = "DOCX",
  ZIP = "ZIP",
  GZIP = "GZIP",
  RAW = "RAW",
  AUTO = "AUTO",
}

// Types from SDK
export type JSONSchema = any;
export type JSONata = string;
export type Upload = File | Blob;

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
  PATCH = "PATCH",
  HEAD = "HEAD",
  OPTIONS = "OPTIONS",
}

export enum CacheMode {
  ENABLED = "ENABLED",
  READONLY = "READONLY",
  WRITEONLY = "WRITEONLY",
  DISABLED = "DISABLED",
}

export enum FileType {
  CSV = "CSV",
  JSON = "JSON",
  XML = "XML",
  YAML = "YAML",
  EXCEL = "EXCEL",
  HTML = "HTML",
  PDF = "PDF",
  DOCX = "DOCX",
  ZIP = "ZIP",
  RAW = "RAW",
  AUTO = "AUTO",
}

export enum AuthType {
  NONE = "NONE",
  OAUTH2 = "OAUTH2",
  HEADER = "HEADER",
  QUERY_PARAM = "QUERY_PARAM",
}

export enum DecompressionMethod {
  GZIP = "GZIP",
  DEFLATE = "DEFLATE",
  NONE = "NONE",
  AUTO = "AUTO",
  ZIP = "ZIP",
}

export enum PaginationType {
  OFFSET_BASED = "OFFSET_BASED",
  PAGE_BASED = "PAGE_BASED",
  CURSOR_BASED = "CURSOR_BASED",
  DISABLED = "DISABLED",
}

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export enum UpsertMode {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  UPSERT = "UPSERT",
}

export enum CredentialMode {
  MERGE = "MERGE",
  REPLACE = "REPLACE",
}

export enum SelfHealingMode {
  ENABLED = "ENABLED",
  TRANSFORM_ONLY = "TRANSFORM_ONLY",
  REQUEST_ONLY = "REQUEST_ONLY",
  DISABLED = "DISABLED",
}

export enum RunStatus {
  RUNNING = "RUNNING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  ABORTED = "ABORTED",
}

export enum RequestSource {
  API = "api",
  FRONTEND = "frontend",
  SCHEDULER = "scheduler",
  MCP = "mcp",
  TOOL_CHAIN = "tool-chain",
  WEBHOOK = "webhook",
}

export enum FilterTarget {
  KEYS = "KEYS",
  VALUES = "VALUES",
  BOTH = "BOTH",
}

export enum FilterAction {
  REMOVE = "REMOVE",
  MASK = "MASK",
  FAIL = "FAIL",
}

export enum RemoveScope {
  FIELD = "FIELD", // Just this field - remove only the matched key-value
  ITEM = "ITEM", // This item - remove the containing object
  ENTRY = "ENTRY", // Entire entry - remove from top-level array
}

export interface ResponseFilter {
  id: string;
  name?: string;
  enabled: boolean;
  target: FilterTarget;
  pattern: string;
  action: FilterAction;
  maskValue?: string;
  scope?: RemoveScope; // Applies to REMOVE and MASK actions
}

export interface BaseConfig {
  id: string;
  version?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BaseResult {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
  headers?: Record<string, any>;
  statusCode?: number;
  startedAt: Date;
  completedAt: Date;
}

export interface Pagination {
  type: PaginationType;
  pageSize?: string;
  cursorPath?: string;
  stopCondition?: string;
}

export interface ApiConfig extends BaseConfig {
  urlHost?: string;
  urlPath?: string;
  instruction: string;
  method?: HttpMethod;
  queryParams?: Record<string, any>;
  headers?: Record<string, any>;
  body?: string;
  pagination?: Pagination;
}

export interface ExtractConfig extends BaseConfig {
  urlHost?: string;
  urlPath?: string;
  instruction: string;
  queryParams?: Record<string, any>;
  method?: HttpMethod;
  headers?: Record<string, any>;
  body?: string;
  documentationUrl?: string;
  decompressionMethod?: DecompressionMethod;
  authentication?: AuthType;
  fileType?: FileType;
  dataPath?: string;
}

export interface ExecutionStep {
  id: string;
  modify?: boolean;
  apiConfig: ApiConfig;
  systemId?: string;
  executionMode?: "DIRECT" | "LOOP";
  loopSelector?: string;
  failureBehavior?: "FAIL" | "CONTINUE";
}

export interface Tool extends BaseConfig {
  steps: ExecutionStep[];
  systemIds?: string[];
  finalTransform?: JSONata;
  inputSchema?: JSONSchema;
  responseSchema?: JSONSchema;
  instruction?: string;
  originalResponseSchema?: JSONSchema;
  folder?: string;
  archived?: boolean;
  responseFilters?: ResponseFilter[];
}

export interface ToolStepResult {
  stepId: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface ToolResult extends BaseResult {
  config: Tool;
  stepResults: ToolStepResult[];
}

export interface CallEndpointArgs {
  systemId?: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface CallEndpointResult {
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: any;
  error?: string;
  duration: number;
}

export interface DocumentationFiles {
  uploadFileIds?: string[];
  scrapeFileIds?: string[];
  openApiFileIds?: string[];
}

export interface System extends BaseConfig {
  name?: string;
  type?: string;
  urlHost?: string;
  urlPath?: string;
  credentials?: Record<string, any>;
  documentationUrl?: string;
  documentation?: string;
  documentationPending?: boolean;
  openApiSchema?: string;
  openApiUrl?: string;
  specificInstructions?: string;
  documentationKeywords?: string[];
  icon?: string;
  metadata?: Record<string, any>;
  templateName?: string;
  documentationFiles?: DocumentationFiles;
}

export interface SystemInput {
  id: string;
  name?: string;
  urlHost?: string;
  urlPath?: string;
  documentationUrl?: string;
  documentation?: string;
  documentationPending?: boolean;
  specificInstructions?: string;
  documentationKeywords?: string[];
  icon?: string;
  credentials?: Record<string, string>;
  metadata?: Record<string, any>;
  templateName?: string;
}

export interface SuggestedTool {
  id: string;
  instruction?: string;
  inputSchema?: JSONSchema;
  responseSchema?: JSONSchema;
  steps: Array<{
    systemId?: string;
    instruction?: string;
  }>;
  reason: string;
}

export type RunResult = ApiResult | ToolResult;

export type ExtractResult = BaseResult & {
  config: ExtractConfig;
};

export type ApiResult = BaseResult & {
  config: ApiConfig;
};

export type ApiInputRequest = {
  id?: string;
  endpoint?: ApiConfig;
};

export type ExtractInputRequest = {
  id?: string;
  endpoint?: ExtractConfig;
  file?: Upload;
};

export type ToolInputRequest = {
  id?: string;
  workflow?: Tool;
};

// Legacy alias
export type WorkflowInputRequest = ToolInputRequest;

export type RequestOptions = {
  cacheMode?: CacheMode;
  selfHealing?: SelfHealingMode;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  webhookUrl?: string;
  testMode?: boolean;
};

export interface RunMetadata {
  startedAt: string; // ISO string
  completedAt?: string; // ISO string
  durationMs?: number;
}

export interface Run {
  runId: string;
  toolId: string;
  tool?: Tool;
  status: RunStatus;
  toolPayload?: Record<string, any>;
  data?: any;
  error?: string;
  stepResults?: ToolStepResult[];
  options?: RequestOptions;
  requestSource?: RequestSource;
  traceId?: string;
  metadata: RunMetadata;
}

export interface ApiCallArgs {
  id?: string;
  endpoint?: ApiConfig;
  payload?: Record<string, any>;
  credentials?: Record<string, string>;
  options?: RequestOptions;
}

export interface ExtractArgs {
  id?: string;
  endpoint?: ExtractConfig;
  file?: Upload;
  options?: RequestOptions;
  payload?: Record<string, any>;
  credentials?: Record<string, string>;
}

export interface ToolArgs {
  id?: string;
  tool?: Tool;
  payload?: Record<string, any>;
  credentials?: Record<string, string>;
  options?: RequestOptions;
  verbose?: boolean;
  runId?: string;
  traceId?: string;
}

export interface GenerateTransformArgs {
  currentTransform?: string;
  responseSchema?: JSONSchema;
  stepData: Record<string, any>;
  errorMessage?: string;
  instruction?: string;
}

// Legacy alias
export type WorkflowArgs = ToolArgs;

export interface BuildToolArgs {
  instruction: string;
  payload?: Record<string, any>;
  systemIds?: string[];
  responseSchema?: JSONSchema;
  save?: boolean;
  verbose?: boolean;
  traceId?: string;
}

// Legacy alias
export type BuildWorkflowArgs = BuildToolArgs;

export interface ToolDiff {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: any;
  from?: string;
}

export interface FixToolArgs {
  tool: Tool;
  fixInstructions: string;
  lastError?: string;
  stepResults?: ToolStepResult[];
  systemIds?: string[];
}

export interface FixToolResult {
  tool: Tool;
  diffs: ToolDiff[];
}

export interface GenerateStepConfigArgs {
  systemId?: string;
  currentDataSelector?: string;
  currentStepConfig?: Partial<ApiConfig>;
  stepInput?: Record<string, any>;
  credentials?: Record<string, string>;
  errorMessage?: string;
}

export type SystemList = {
  items: System[];
  total: number;
};

export type ToolScheduleInput = {
  id?: string;
  toolId?: string;
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  payload?: Record<string, any>;
  options?: RequestOptions;
};

export type ToolSchedule = {
  id: string;
  toolId: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  payload?: Record<string, any>;
  options?: RequestOptions;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export enum DiscoveryRunStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  ABORTED = "ABORTED",
}

export type DiscoverySourceType = "file" | "url" | "system";

export interface DiscoverySource {
  id: string;
  type: DiscoverySourceType;
}

export interface DiscoveryRunData {
  title?: string;
  description?: string;
  systems?: ExtendedSystem[];
  error?: string;
}

export interface DiscoveryRun {
  id: string;
  sources: DiscoverySource[];
  data?: DiscoveryRunData;
  status: DiscoveryRunStatus;
  createdAt: Date;
}

export enum FileStatus {
  PENDING = "PENDING",
  UPLOADING = "UPLOADING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface FileReference {
  id: string;
  storageUri: string;
  processedStorageUri?: string;
  metadata: any;
  status: FileStatus;
  error?: string;
  createdAt?: Date;
}

export interface BatchFileUploadRequest {
  files: Array<{
    fileName: string;
    metadata?: {
      contentType?: string;
      contentLength?: number;
      [key: string]: any;
    };
  }>;
}

export interface BatchFileUploadResponse {
  success: boolean;
  files: Array<{
    id: string;
    originalFileName: string;
    uploadUrl: string;
    expiresIn: number;
  }>;
}

export interface ExtendedSystem extends Omit<System, "icon"> {
  icon?: {
    name: string;
    source: "simpleicons" | "lucide";
  };
  sources: string[];
  capabilities: string[];
  confidence: "high" | "medium" | "low";
  evidence: string;
  systemDetails?: string;
  matchedSystemId?: string; // If set, discovered system matches this existing system
  potentialConnections?: string[];
}

export interface DiscoveryResult {
  title: string;
  description: string;
  systems: ExtendedSystem[];
}

export enum ConfirmationAction {
  CONFIRMED = "confirmed",
  DECLINED = "declined",
  PARTIAL = "partial",
}

export interface AgentRequest {
  agentId: string;
  messages: Message[];
  runtimeContext?: string;
  agentParams?: Record<string, any>;
  filePayloads?: Record<string, any>;
}

export interface NotificationRuleConditions {
  status: "failed" | "success" | "any";
  toolIdPattern?: string;
  requestSources?: RequestSource[];
  tags?: string[];
  folders?: string[];
}

export interface NotificationRule {
  id: string;
  enabled: boolean;
  conditions: NotificationRuleConditions;
}

export type NotificationChannelStatus = "active" | "failing" | "disabled";

export interface BaseChannelConfig {
  enabled: boolean;
  rules: NotificationRule[];
  status: NotificationChannelStatus;
  consecutiveFailures: number;
  lastError?: string;
  lastErrorAt?: string;
}

export type SlackAuthType = "webhook" | "bot_token" | "oauth";

export interface SlackChannelConfig extends BaseChannelConfig {
  authType: SlackAuthType;
  webhookUrl?: string;
  botToken?: string;
  channelId?: string;
  accessToken?: string;
  teamId?: string;
}

export interface EmailChannelConfig extends BaseChannelConfig {
  recipients: string[];
  fromAddress?: string;
}

export interface NotificationChannels {
  slack?: SlackChannelConfig;
  email?: EmailChannelConfig;
}

export interface NotificationRateLimit {
  maxPerHour: number;
  currentCount: number;
  windowStart: string;
}

export interface NotificationSettings {
  channels: NotificationChannels;
  rateLimit: NotificationRateLimit;
}

export interface OrgSettings {
  orgId: string;
  notifications?: NotificationSettings; // Optional - might not exist yet
  preferences: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
