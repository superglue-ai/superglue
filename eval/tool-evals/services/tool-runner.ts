import { Integration } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { DataStore } from "../../../packages/core/datastore/types.js";
import { TestSuiteSettings, ToolAttempt, ToolConfig, ValidationLLMConfig } from "../types.js";
import { PromiseQueue } from "../utils/promise-queue.js";
import { SuperglueToolAttemptService } from "./tool-attempt.js";

export class ToolRunnerService {
    constructor(
        private datastore: DataStore,
        private metadata: Metadata,
        private validationLlmConfig?: ValidationLLMConfig
    ) {
    }

    public async runTools(tools: ToolConfig[], integrations: Integration[], settings: TestSuiteSettings): Promise<ToolAttempt[]> {
        const toolAttemptService = new SuperglueToolAttemptService(this.metadata, this.datastore, this.validationLlmConfig);
        const queue = settings.maxConcurrentWorkers ? new PromiseQueue(settings.maxConcurrentWorkers) : null;
        const timeoutMs = settings.toolAttemptTimeoutMs ?? 300000;

        const runAttempt = (fn: () => Promise<ToolAttempt>, toolId: string): Promise<ToolAttempt> => {
            const wrappedFn = async (): Promise<ToolAttempt> => {
                try {
                    const timeout = new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error(`Tool attempt timed out after ${timeoutMs / 1000}s`)), timeoutMs)
                    );
                    return await Promise.race([fn(), timeout]);
                } catch (error) {
                    return {
                        toolConfig: { id: toolId } as any,
                        selfHealingEnabled: false,
                        buildTime: null,
                        buildSuccess: false,
                        executionTime: null,
                        executionSuccess: false,
                        status: 'EXECUTION_FAILED' as any,
                        executionError: error instanceof Error ? error.message : String(error),
                        failureReason: 'EXECUTION' as any,
                        createdAt: new Date(),
                    };
                }
            };
            return queue ? queue.enqueue(wrappedFn) : wrappedFn();
        };

        const allAttempts: ToolAttempt[] = [];

        if (settings.runOneShotMode) {
            // Run all one-shot attempts first
            const oneShotPromises: Promise<ToolAttempt>[] = [];
            
            for (const tool of tools) {
                const toolIntegrations = integrations.filter(i => tool.integrationIds.includes(i.id));
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    oneShotPromises.push(
                        runAttempt(() => toolAttemptService.runToolAttempt(tool, toolIntegrations, false), tool.id)
                    );
                }
            }

            const oneShotAttempts = await Promise.all(oneShotPromises);
            allAttempts.push(...oneShotAttempts);

            // Determine which tools need self-healing
            if (settings.runSelfHealingMode) {
                const toolsNeedingSelfHealing = tools.filter(tool => {
                    const toolOneShotAttempts = oneShotAttempts.filter(a => a.toolConfig.id === tool.id);
                    const hadSuccess = toolOneShotAttempts.some(a => 
                        a.buildSuccess && 
                        a.executionSuccess && 
                        (!a.validationResult || a.validationResult.passed)
                    );
                    return !hadSuccess;
                });

                // Run self-healing attempts for failed tools
                const selfHealingPromises: Promise<ToolAttempt>[] = [];
                
                for (const tool of toolsNeedingSelfHealing) {
                    const toolIntegrations = integrations.filter(i => tool.integrationIds.includes(i.id));
                    for (let i = 0; i < settings.attemptsEachMode; i++) {
                        selfHealingPromises.push(
                            runAttempt(() => toolAttemptService.runToolAttempt(tool, toolIntegrations, true), tool.id)
                        );
                    }
                }

                const selfHealingAttempts = await Promise.all(selfHealingPromises);
                allAttempts.push(...selfHealingAttempts);
            }
        } else if (settings.runSelfHealingMode) {
            // One-shot mode disabled, run self-healing mode only
            const selfHealingPromises: Promise<ToolAttempt>[] = [];
            
            for (const tool of tools) {
                const toolIntegrations = integrations.filter(i => tool.integrationIds.includes(i.id));
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    selfHealingPromises.push(
                        runAttempt(() => toolAttemptService.runToolAttempt(tool, toolIntegrations, true), tool.id)
                    );
                }
            }

            const selfHealingAttempts = await Promise.all(selfHealingPromises);
            allAttempts.push(...selfHealingAttempts);
        }

        return allAttempts;
    }
}