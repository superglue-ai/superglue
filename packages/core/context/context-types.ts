import { System, JSONSchema, ServiceMetadata } from "@superglue/shared";

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
