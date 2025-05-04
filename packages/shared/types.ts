import type { FileUpload } from "graphql-upload-minimal";
import type { JSONSchema } from "openai/src/lib/jsonschema.js";
import type { DataStore } from "./datastore.js";

export type Context = {
  datastore: DataStore;
  orgId: string;
};

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
  EXCEL = "EXCEL",
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
  startedAt: Date;
  completedAt: Date;
}

export interface ApiConfig extends BaseConfig {
  urlHost: string;
  urlPath?: string;
  instruction: string;
  method?: HttpMethod;
  queryParams?: Record<string, any>;
  headers?: Record<string, any>;
  body?: string;
  documentationUrl?: string;
  responseSchema?: JSONSchema;
  responseMapping?: string;
  authentication?: AuthType;
  pagination?: Pagination;
  dataPath?: string;
}

export interface ExtractConfig extends BaseConfig {
  urlHost: string;
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

export interface TransformConfig extends BaseConfig {
  instruction: string;
  responseSchema: JSONSchema;
  responseMapping?: string;
  confidence?: number;
  confidence_reasoning?: string;
}

export type Pagination = {
  type: PaginationType;
  pageSize?: number;
  cursorPath?: string;
};

export type RunResult = BaseResult & {
  config: ApiConfig | ExtractConfig | TransformConfig;
};

export type ApiInputRequest = {
  id?: string;
  endpoint?: ApiConfig;
};

export type ExtractInputRequest = {
  id?: string;
  endpoint?: ExtractConfig;
  file?: Promise<FileUpload>;
};

export type TransformInputRequest = {
  id?: string;
  endpoint?: TransformConfig;
  file?: Promise<FileUpload>;
};

export type RequestOptions = {
  cacheMode?: CacheMode;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  webhookUrl?: string;
};

export type ResultList = {
  items: RunResult[];
  total: number;
};

export type ConfigList = {
  items: ApiConfig[];
  total: number;
};

// Workflow related types
export type ExecutionMode = "DIRECT" | "LOOP";

// Removed VariableMapping as it's not in the GraphQL schema

export interface ExecutionStep {
  id: string;
  apiConfig: ApiConfig;
  executionMode: ExecutionMode;
  loopSelector?: string;
  loopMaxIters?: number;
  inputMapping?: string;
  responseMapping?: string;
}

export interface WorkflowStepResult {
  stepId: string;
  success: boolean;
  rawData?: unknown;
  transformedData?: unknown;
  error?: string;
}

export interface WorkflowResult {
  success: boolean;
  data: Record<string, unknown>;
  stepResults: WorkflowStepResult[];
  error?: string;
  startedAt: Date;
  completedAt: Date;
}

export interface Workflow extends BaseConfig {
  id: string; 
  steps: ExecutionStep[];
  finalTransform?: string;
}

export interface Metadata {
  runId?: string;
  orgId?: string;
}
export interface LogEntry {
  id: string;
  message: string;
  level: string;
  timestamp: Date;
  runId?: string;
  orgId?: string;
}