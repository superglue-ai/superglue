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

        const runAttempt = (fn: () => Promise<ToolAttempt>): Promise<ToolAttempt> => {
            const wrappedFn = async () => {
                const timeout = new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error(`Tool attempt timed out after ${timeoutMs / 1000}s`)), timeoutMs)
                );
                return Promise.race([fn(), timeout]);
            };
            return queue ? queue.enqueue(wrappedFn) : wrappedFn();
        };

        // Run all one-shot attempts first
        const promises: Promise<ToolAttempt>[] = [];

        for (const tool of tools) {
            const toolIntegrations = integrations.filter(i => tool.integrationIds.includes(i.id));
            for (let i = 0; i < settings.attemptsEachMode; i++) {
                // If one-shot mode is enabled, run one-shot attempts
                if (settings.runOneShotMode) {
                    promises.push(
                        runAttempt(() => toolAttemptService.runToolAttempt(tool, toolIntegrations, false))
                    );
                }

                // If self-healing mode is enabled, run self-healing attempts
                if (settings.runSelfHealingMode) {
                    promises.push(
                        runAttempt(() => toolAttemptService.runToolAttempt(tool, toolIntegrations, true))
                    );
                }
            }
        }

        const attempts = await Promise.all(promises); // wait for all attempts to complete
        return attempts;
    }
}