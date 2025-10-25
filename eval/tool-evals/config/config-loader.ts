import { readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentEvalConfig } from "../types.js";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const IntegrationConfigSchema = z.object({
    id: z.string(),
    name: z.string(),
    urlHost: z.string(),
    urlPath: z.string().optional(),
    documentationUrl: z.string().optional(),
    openApiUrl: z.string().optional(),
    credentials: z.record(z.string()),
    description: z.string().optional(),
    keywords: z.array(z.string()),
});

const ToolConfigSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['retrieval', 'action', 'upsert']),
    instruction: z.string(),
    integrationIds: z.array(z.string()).min(0),
    validationFunction: z.string().optional(),
    skipValidationFunction: z.boolean().optional(),
    expectedResultDescription: z.string().optional(),
    payload: z.any().optional(),
});

const TestSuiteSettingsSchema = z.object({
    runOneShotMode: z.boolean(),
    runSelfHealingMode: z.boolean(),
    attemptsEachMode: z.number().min(1),
});

const ValidationLLMConfigSchema = z.object({
    provider: z.string(),
    model: z.string(),
});

const AgentEvalConfigSchema = z.object({
    integrations: z.array(IntegrationConfigSchema).min(1),
    tools: z.array(ToolConfigSchema).min(1),
    enabledTools: z.union([z.literal('all'), z.array(z.string()).min(1)]),
    settings: TestSuiteSettingsSchema,
    validationLlmConfig: ValidationLLMConfigSchema.optional(),
});

export async function loadConfig(): Promise<AgentEvalConfig> {
    const configPath = join(
        dirname(fileURLToPath(import.meta.url)),
        "../tool-eval-config.json"
    );

    try {
        await access(configPath);
    } catch {
        throw new Error(`Config file not found: ${configPath}`);
    }

    const configContent = await readFile(configPath, "utf-8");
    const rawConfig = JSON.parse(configContent);

    const configWithDefaults = {
        ...rawConfig,
        settings: {
            runOneShotMode: true,
            runSelfHealingMode: true,
            ...rawConfig.settings,
        },
        validationLlmConfig: rawConfig.validationLlmConfig || {
            provider: "openai",
            model: "gpt-4o",
        },
    };

    const result = AgentEvalConfigSchema.safeParse(configWithDefaults);
    if (!result.success) {
        throw new Error(`Invalid config: ${result.error.message}`);
    }

    const config = result.data as AgentEvalConfig;

    validateIntegrationIds(config);
    validateEnabledWorkflows(config);

    await processFilePayloads(config);

    return config;
}

async function processFilePayloads(config: AgentEvalConfig): Promise<void> {
    const exampleFilesDir = join(
        dirname(fileURLToPath(import.meta.url)),
        "../data/example-files"
    );

    for (const tool of config.tools) {
        if (!tool.payload || typeof tool.payload !== 'object') {
            continue;
        }

        for (const [key, value] of Object.entries(tool.payload)) {
            if (key.endsWith('_file') && typeof value === 'string') {
                const filePath = join(exampleFilesDir, value);
                try {
                    await access(filePath);
                    const fileContent = await readFile(filePath, 'utf-8');
                    tool.payload[key] = fileContent;
                } catch (error) {
                    throw new Error(`Failed to read file ${filePath} for tool ${tool.id}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
    }
}

function validateIntegrationIds(config: z.infer<typeof AgentEvalConfigSchema>): void {
    const integrationIds = new Set(config.integrations.map(i => i.id));
    
    for (const tool of config.tools) {
        const invalidIds = tool.integrationIds.filter(id => !integrationIds.has(id));
        if (invalidIds.length > 0) {
            throw new Error(`Invalid integration IDs: ${invalidIds.join(", ")}`);
        }
    }
}

function validateEnabledWorkflows(config: AgentEvalConfig): void {
    if (config.enabledTools === 'all') {
        return;
    }
    
    const enabledTools = new Set(config.enabledTools);
    const tools = new Set(config.tools.map(t => t.id));

    for (const tool of enabledTools) {
        if (!tools.has(tool)) {
            throw new Error(`Invalid enabled tool: ${tool}`);
        }
    }
}
