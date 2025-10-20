import { readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentEvalConfig } from "./types.js";
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

const WorkflowConfigSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['retrieval', 'action', 'upsert']),
    instruction: z.string(),
    integrationIds: z.array(z.string()).min(1),
    expectedData: z.any().optional(),
    allowAdditionalProperties: z.boolean().optional(),
    payload: z.any().optional(),
});

const TestSuiteSettingsSchema = z.object({
    runOneShotMode: z.boolean(),
    runSelfHealingMode: z.boolean(),
    attemptsEachMode: z.number().min(1),
});

const AgentEvalConfigSchema = z.object({
    integrations: z.array(IntegrationConfigSchema).min(1),
    workflows: z.array(WorkflowConfigSchema).min(1),
    enabledWorkflows: z.union([z.literal('all'), z.array(z.string()).min(1)]),
    settings: TestSuiteSettingsSchema,
});

export async function loadConfig(): Promise<AgentEvalConfig> {
    const configPath = join(
        dirname(fileURLToPath(import.meta.url)),
        "agent-eval-config.json"
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
    };

    const result = AgentEvalConfigSchema.safeParse(configWithDefaults);
    if (!result.success) {
        throw new Error(`Invalid config: ${result.error.message}`);
    }

    const config = result.data as AgentEvalConfig;

    validateIntegrationIds(config);
    validateEnabledWorkflows(config);

    return config;
}

function validateIntegrationIds(config: z.infer<typeof AgentEvalConfigSchema>): void {
    const integrationIds = new Set(config.integrations.map(i => i.id));
    
    for (const workflow of config.workflows) {
        const invalidIds = workflow.integrationIds.filter(id => !integrationIds.has(id));
        if (invalidIds.length > 0) {
            throw new Error(`Invalid integration IDs: ${invalidIds.join(", ")}`);
        }
    }
}

function validateEnabledWorkflows(config: AgentEvalConfig): void {
    if (config.enabledWorkflows === 'all') {
        return;
    }
    
    const enabledWorkflows = new Set(config.enabledWorkflows);
    const workflows = new Set(config.workflows.map(w => w.id));

    for (const workflow of enabledWorkflows) {
        if (!workflows.has(workflow)) {
            throw new Error(`Invalid enabled workflow: ${workflow}`);
        }
    }
}
