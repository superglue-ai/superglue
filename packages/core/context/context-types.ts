import { System, JSONSchema, ApiConfig, ServiceMetadata } from "@superglue/shared";

export type ObjectContextOptions = {
  characterBudget: number;
  include?: { schema?: boolean; preview?: boolean; samples?: boolean };
  tuning?: {
    previewDepthLimit?: number;
    previewArrayLimit?: number;
    previewObjectKeyLimit?: number;
    samplesMaxArrayPaths?: number;
    samplesItemsPerArray?: number;
    sampleObjectMaxDepth?: number;
  };
};

export type SystemContextOptions = {
  characterBudget: number;
  include?: { authContext?: boolean; paginationContext?: boolean; generalContext?: boolean };
  tuning?: {
    documentationMaxSections?: number;
    documentationMaxChars?: number;
  };
  metadata: ServiceMetadata;
};

export type ToolBuilderContextOptions = {
  characterBudget: number;
  include?: {
    systemContext?: boolean;
    availableVariablesContext?: boolean;
    payloadContext?: boolean;
    userInstruction?: boolean;
  };
};

export type ToolBuilderContextInput = {
  systems: System[];
  payload: any;
  userInstruction: string;
  responseSchema?: JSONSchema;
  metadata: ServiceMetadata;
};

export type EvaluateStepResponseContextInput = {
  data: any;
  config: ApiConfig;
  docSearchResultsForStepInstruction: string;
};

export type EvaluateStepResponseContextOptions = {
  characterBudget: number;
};

export type TransformContextInput = {
  instruction: string;
  targetSchema: JSONSchema;
  sourceData: any;
};

export type TransformContextOptions = {
  characterBudget: number;
};

export type EvaluateTransformContextInput = {
  instruction: string;
  targetSchema: JSONSchema;
  sourceData: any;
  transformedData: any;
  transformCode: string;
};

export type EvaluateTransformContextOptions = {
  characterBudget: number;
};

export type GenerateStepConfigContextInput = {
  instruction: string;
  previousStepConfig?: Partial<ApiConfig>;
  previousStepDataSelector?: string;
  stepInput?: any;
  credentials?: Record<string, string>;
  systemDocumentation: string;
  systemSpecificInstructions: string;
  errorMessage?: string;
};

export type GenerateStepConfigContextOptions = {
  characterBudget: number;
  mode: "create" | "edit" | "self-healing";
};
