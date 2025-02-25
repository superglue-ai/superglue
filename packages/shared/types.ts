import { FileUpload } from "graphql-upload-minimal";
import { JSONSchema } from "openai/src/lib/jsonschema.js";
import { DataStore } from "./datastore.js";
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
  DISABLED = "DISABLED"
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
};

export type RunResult = BaseResult & {
  config: ApiConfig | ExtractConfig | TransformConfig;
};

export type ApiInput = {
  urlHost: string;
  urlPath?: string;
  queryParams?: Record<string, any>;
  instruction: string;
  method?: HttpMethod;
  headers?: Record<string, any>;
  body?: string;
  documentationUrl?: string;
  responseSchema?: JSONSchema;
  responseMapping?: any;
  authentication?: AuthType;
  pagination?: Pagination;
  dataPath?: string;
  version?: string;
};

export type ApiInputRequest = {
  id?: string;
  endpoint: ApiInput;
};

export type ExtractInputRequest = {
  id?: string;
  endpoint: ExtractInput;
  file?: Promise<FileUpload>;
};

export type TransformInputRequest = {
  id?: string;
  endpoint?: TransformInput;
};

export type ExtractInput = {
  urlHost: string;
  urlPath?: string;
  queryParams?: Record<string, any>;
  instruction: string;
  method?: HttpMethod;
  headers?: Record<string, any>;
  body?: string;
  documentationUrl?: string;
  decompressionMethod?: DecompressionMethod;
  authentication?: AuthType;
  version?: string;
};

export type TransformInput = {
  instruction: string;
  responseSchema: JSONSchema;
  responseMapping?: string;
  version?: string;
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