import { ApiConfig, ExecutionStep, ExtractConfig, Integration, JSONSchema, Workflow } from "@superglue/client";
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

export type WorkflowBuilderContextOptions = {
    characterBudget: number;
    include?: { integrationContext?: boolean; availableVariablesContext?: boolean; payloadContext?: boolean; userInstruction?: boolean };
};

export type WorkflowBuilderContextInput = {
    integrations: Integration[];
    payload: any;
    userInstruction: string;
    responseSchema?: JSONSchema;
};

export type ExtractContextInput = {
    extractConfig: ExtractConfig;
    documentation: string;
    payload: any;
    credentials: Record<string, string>;
    lastError: string | null;
};

export type ExtractContextOptions = {
    characterBudget: number;
    include?: { schema?: boolean; preview?: boolean; samples?: boolean };
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
    endpoint: ApiConfig;
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

export type FindRelevantIntegrationsContextInput = {
    searchTerms: string;
    availableIntegrations: Integration[];
};

export type FindRelevantIntegrationsContextOptions = {
    characterBudget: number;
};

export type FindRelevantToolsContextInput = {
    searchTerms: string;
    availableTools: Workflow[];
};

export type FindRelevantToolsContextOptions = {
    characterBudget: number;
};

export type BuildToolContextOptions = {
    characterBudget: number;
};

export type GenerateApiConfigContextInput = {
    instruction: string;
    previousStepConfig: Partial<ApiConfig>;
    stepInput: any;
    credentials: Record<string, string>;
    integrationManager?: IntegrationManager;
};

export type GenerateApiConfigContextOptions = {
    characterBudget: number;
};

export type PaginationErrorContextInput = {
    paginationType: string;
    apiConfig: ApiConfig;
    missingVariables: string[];
};

export type PaginationErrorContextOptions = {
    characterBudget: number;
};

export type VarResolverErrorContextInput = {
    apiConfig: ApiConfig;
    configField: string;
    errorType: "undefined_variable" | "code_execution_error";
    varReference: string;
    originalErrorMessage?: string;
    allVariables: Record<string, any>;
};

export type VarResolverErrorContextOptions = {
    characterBudget: number;
};

export type PostgresBodyStructureErrorContextInput = {
    bodyContent: string;
    parseError?: string;
    parsedBody?: any;
};

export type PostgresBodyStructureErrorContextOptions = {
    characterBudget: number;
};

export type PostgresSqlExecutionErrorContextInput = {
    queryText: string;
    queryParams?: any[];
    postgresError: string;
    allVariables: Record<string, any>;
};

export type PostgresSqlExecutionErrorContextOptions = {
    characterBudget: number;
};