// Service metadata - lightweight context for logging and tracing in service classes
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
  type: 'content' | 'tool';
  content?: string;
  tool?: ToolCall;
  id: string;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  tools?: ToolCall[];
  parts?: MessagePart[];
  isStreaming?: boolean;
  attachedFiles?: Array<{
    name: string;
    size?: number;
    key: string;
    status?: 'processing' | 'ready' | 'error';
    error?: string;
  }>;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: any;
  output?: any;
  status: 'pending' | 'awaiting_confirmation' | 'running' | 'completed' | 'declined' | 'stopped' | 'error';
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
  ADMIN = 'admin',
  MEMBER = 'member'
}

export enum SupportedFileType {
  JSON = 'JSON',
  CSV = 'CSV',
  XML = 'XML',
  EXCEL = 'EXCEL',
  PDF = 'PDF',
  DOCX = 'DOCX',
  ZIP = 'ZIP',
  GZIP = 'GZIP',
  RAW = 'RAW',
  AUTO = 'AUTO'
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
  OPTIONS = "OPTIONS"
}

export enum CacheMode {
  ENABLED = "ENABLED",
  READONLY = "READONLY",
  WRITEONLY = "WRITEONLY",
  DISABLED = "DISABLED"
}

export enum FileType {
  CSV = "CSV",
  JSON = "JSON",
  XML = "XML",
  EXCEL = "EXCEL",
  HTML = "HTML",
  PDF = "PDF",
  DOCX = "DOCX",
  ZIP = "ZIP",
  RAW = "RAW",
  AUTO = "AUTO"
}

export enum AuthType {
  NONE = "NONE",
  OAUTH2 = "OAUTH2",
  HEADER = "HEADER",
  QUERY_PARAM = "QUERY_PARAM"
}

export enum DecompressionMethod {
  GZIP = "GZIP",
  DEFLATE = "DEFLATE",
  NONE = "NONE",
  AUTO = "AUTO",
  ZIP = "ZIP"
}

export enum PaginationType {
  OFFSET_BASED = "OFFSET_BASED",
  PAGE_BASED = "PAGE_BASED",
  CURSOR_BASED = "CURSOR_BASED",
  DISABLED = "DISABLED"
}

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR"
}

export enum UpsertMode {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  UPSERT = "UPSERT"
}

export enum SelfHealingMode {
  ENABLED = "ENABLED",
  TRANSFORM_ONLY = "TRANSFORM_ONLY",
  REQUEST_ONLY = "REQUEST_ONLY",
  DISABLED = "DISABLED"
}

export enum RunStatus {
  RUNNING = "RUNNING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  ABORTED = "ABORTED"
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
  documentationUrl?: string;
  responseSchema?: JSONSchema;
  responseMapping?: JSONata;
  authentication?: AuthType;
  pagination?: Pagination;
  dataPath?: string;
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
  integrationId?: string;
  executionMode?: 'DIRECT' | 'LOOP';
  loopSelector?: string;
  loopMaxIters?: number;
  inputMapping?: JSONata;
  responseMapping?: JSONata;
  failureBehavior?: 'FAIL' | 'CONTINUE';
}

export interface Tool extends BaseConfig {
  steps: ExecutionStep[];
  integrationIds?: string[];
  finalTransform?: JSONata;
  inputSchema?: JSONSchema;
  responseSchema?: JSONSchema;
  instruction?: string;
  originalResponseSchema?: JSONSchema;
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

export interface Integration extends BaseConfig {
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
}

export interface IntegrationInput {
  id: string;
  urlHost?: string;
  urlPath?: string;
  documentationUrl?: string;
  documentation?: string;
  documentationPending?: boolean;
  specificInstructions?: string;
  documentationKeywords?: string[];
  credentials?: Record<string, string>;
}

export interface SuggestedTool {
  id: string;
  instruction?: string;
  inputSchema?: JSONSchema;
  responseSchema?: JSONSchema;
  steps: Array<{
    integrationId?: string;
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
  workflow?: Tool; // cannot change to tool because of graphql
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

export interface Run {
  id: string;
  toolId: string;
  orgId?: string;
  status: RunStatus;
  toolConfig?: Tool;
  toolPayload?: Record<string, any>;
  toolResult?: any;
  stepResults?: ToolStepResult[];
  options?: RequestOptions;
  requestSource?: string;
  error?: string;
  traceId?: string;
  startedAt: Date;
  completedAt?: Date;
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
  integrationIds?: string[];
  responseSchema?: JSONSchema;
  save?: boolean;
  verbose?: boolean;
}

// Legacy alias
export type BuildWorkflowArgs = BuildToolArgs;

export interface GenerateStepConfigArgs {
  integrationId?: string;
  currentDataSelector?: string;
  currentStepConfig?: Partial<ApiConfig>;
  stepInput?: Record<string, any>;
  credentials?: Record<string, string>;
  errorMessage?: string;
}

export type IntegrationList = {
  items: Integration[];
  total: number;
};

export type ToolScheduleInput = {
  id?: string;
  workflowId?: string; // cannot change to toolId because of graphql
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  payload?: Record<string, any>;
  options?: RequestOptions;
}

export type ToolSchedule = {
  id: string;
  workflowId: string; // cannot change to toolId because of graphql
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  payload?: Record<string, any>;
  options?: RequestOptions;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}




// Legacy aliases
export type WorkflowScheduleInput = ToolScheduleInput;
export type WorkflowSchedule = ToolSchedule;

export enum DiscoveryRunStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  ABORTED = "ABORTED"
}

export interface DiscoveryRun {
  id: string;
  fileIds: string[];
  data?: any;
  status: DiscoveryRunStatus;
  startedAt: Date;
  completedAt?: Date;
}

export enum FileStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED"
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