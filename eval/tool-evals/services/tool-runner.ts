import { Integration } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { DataStore } from "../../../packages/core/datastore/types.js";
import { ToolAttempt, ToolConfig, TestSuiteSettings, ValidationLLMConfig } from "../types.js";
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

        // Run all tools in parallel, each with tool-level batching
        const toolPromises = tools.map(async (tool) => {
            const toolIntegrations = integrations.filter(i => tool.integrationIds.includes(i.id));
            const attempts: ToolAttempt[] = [];
            
            if (settings.runOneShotMode) {
                const oneShotPromises: Promise<ToolAttempt>[] = [];
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    oneShotPromises.push(
                        toolAttemptService.runToolAttempt(tool, toolIntegrations, false)
                    );
                }
                
                const oneShotAttempts = await Promise.all(oneShotPromises);
                attempts.push(...oneShotAttempts);
                
                const hadOneShotSuccess = oneShotAttempts.some(a => 
                    a.buildSuccess && 
                    a.executionSuccess && 
                    (!a.validationResult || a.validationResult.passed)
                );
                
                if (settings.runSelfHealingMode && !hadOneShotSuccess) {
                    const selfHealingPromises: Promise<ToolAttempt>[] = [];
                    for (let i = 0; i < settings.attemptsEachMode; i++) {
                        selfHealingPromises.push(
                            toolAttemptService.runToolAttempt(tool, toolIntegrations, true)
                        );
                    }
                    
                    const selfHealingAttempts = await Promise.all(selfHealingPromises);
                    attempts.push(...selfHealingAttempts);
                }
            } else if (settings.runSelfHealingMode) {
                // One-shot mode disabled, run self-healing mode only
                const selfHealingPromises: Promise<ToolAttempt>[] = [];
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    selfHealingPromises.push(
                        toolAttemptService.runToolAttempt(tool, toolIntegrations, true)
                    );
                }
                
                const selfHealingAttempts = await Promise.all(selfHealingPromises);
                attempts.push(...selfHealingAttempts);
            }
            
            return attempts;
        });

        const allToolAttempts = await Promise.all(toolPromises);
        return allToolAttempts.flat();
    }
}