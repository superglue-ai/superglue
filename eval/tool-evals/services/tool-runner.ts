import { Integration } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { DataStore } from "../../../packages/core/datastore/types.js";
import { ToolAttempt, ToolConfig, TestSuiteSettings, ValidationLLMConfig } from "../types.js";
import { SuperglueToolAttemptService } from "./tool-attempt.js";
import { PromiseQueue } from "../utils/promise-queue.js";


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

        const runAttempt = (fn: () => Promise<ToolAttempt>): Promise<ToolAttempt> => {
            return queue ? queue.enqueue(fn) : fn();
        };

        const allAttempts: ToolAttempt[] = [];

        if (settings.runOneShotMode) {
            // Run all one-shot attempts first
            const oneShotPromises: Promise<ToolAttempt>[] = [];
            
            for (const tool of tools) {
                const toolIntegrations = integrations.filter(i => tool.integrationIds.includes(i.id));
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    oneShotPromises.push(
                        runAttempt(() => toolAttemptService.runToolAttempt(tool, toolIntegrations, false))
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
                            runAttempt(() => toolAttemptService.runToolAttempt(tool, toolIntegrations, true))
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
                        runAttempt(() => toolAttemptService.runToolAttempt(tool, toolIntegrations, true))
                    );
                }
            }

            const selfHealingAttempts = await Promise.all(selfHealingPromises);
            allAttempts.push(...selfHealingAttempts);
        }

        return allAttempts;
    }
}