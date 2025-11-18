import { Integration, JSONSchema, ExecutionStep, ApiConfig } from "@superglue/client";
import { IntegrationManager } from "../integrations/integration-manager.js";

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

export type IntegrationContextOptions = {
    characterBudget: number;
    include?: { authContext?: boolean; paginationContext?: boolean; generalContext?: boolean };
    tuning?: {
        documentationMaxSections?: number;
        documentationMaxChars?: number;
    };
};

export type ToolBuilderContextOptions = {
    characterBudget: number;
    include?: { integrationContext?: boolean; availableVariablesContext?: boolean; payloadContext?: boolean; userInstruction?: boolean };
};

export type ToolBuilderContextInput = {
    integrations: Integration[];
    payload: any;
    userInstruction: string;
    responseSchema?: JSONSchema;
};

export type LoopSelectorContextInput = {
    step: ExecutionStep;
    payload: any;
    instruction: string;
};

export type LoopSelectorContextOptions = {
    characterBudget: number;
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
    stepInput?: any;
    credentials?: Record<string, string>;
    integrationDocumentation: string;
    integrationSpecificInstructions: string;
    errorMessage?: string;
};

export type GenerateStepConfigContextOptions = {
    characterBudget: number;
    mode: 'create' | 'edit' | 'self-healing';
};