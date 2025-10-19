import { Integration, JSONSchema } from "@superglue/client";
import { ExtractConfig } from "@superglue/client";
import { ExecutionStep } from "@superglue/client";
import { ApiConfig } from "@superglue/client";

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

export type WorkflowBuilderContextOptions = {
    characterBudget: number;
    include?: { integrationContext?: boolean; availableVariablesContext?: boolean; payloadContext?: boolean; userInstruction?: boolean };
};

export type WorkflowBuilderContextInput = {
    integrations: Integration[];
    payload: Record<string, unknown>;
    userInstruction: string;
    responseSchema?: JSONSchema;
};

export type ExtractContextInput = {
    extractConfig: ExtractConfig;
    documentation: string;
    payload: Record<string, unknown>;
    credentials: Record<string, string>;
    lastError: string | null;
};

export type ExtractContextOptions = {
    characterBudget: number;
    include?: { schema?: boolean; preview?: boolean; samples?: boolean };
};

export type LoopSelectorContextInput = {
    step: ExecutionStep;
    payload: Record<string, unknown>;
    instruction: string;
};

export type LoopSelectorContextOptions = {
    characterBudget: number;
};

export type EvaluateStepResponseContextInput = {
    data: Record<string, unknown>;
    endpoint: ApiConfig;
    docSearchResultsForStepInstruction: string;
};

export type EvaluateStepResponseContextOptions = {
    characterBudget: number;
};