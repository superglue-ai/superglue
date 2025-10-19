import { Integration } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { DataStore } from "../../datastore/types.js";
import { WorkflowAttempt, WorkflowConfig, TestSuiteSettings } from "./types.js";
import { SuperglueWorkflowAttemptService } from "./workflow-attempt.js";


export class WorkflowRunnerService {
    constructor(
        private datastore: DataStore,
        private metadata: Metadata
    ) {
    }

    public async runWorkflows(workflows: WorkflowConfig[], integrations: Integration[], settings: TestSuiteSettings): Promise<WorkflowAttempt[]> {
        const workflowAttemptService = new SuperglueWorkflowAttemptService(this.metadata, this.datastore);
        const allAttempts: WorkflowAttempt[] = [];
        const allPromises: Promise<void>[] = [];

        if (settings.runOneShotMode) {
            // Run all one-shot attempts in parallel
            for (const workflow of workflows) {
                const workflowsIntegrations = integrations.filter(i => workflow.integrationIds.includes(i.id));
                
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    const oneShotPromise = workflowAttemptService
                        .runWorkflowAttempt(workflow, workflowsIntegrations, false)
                        .then(async (attempt) => {
                            allAttempts.push(attempt);
                            
                            // Dynamically start self-healing run immediately on failure
                            const attemptFailed = !attempt.buildSuccess || !attempt.executionSuccess;
                            if (settings.runSelfHealingMode && attemptFailed) {
                                const selfHealingAttempt = await workflowAttemptService.runWorkflowAttempt(
                                    workflow, 
                                    workflowsIntegrations, 
                                    true
                                );
                                allAttempts.push(selfHealingAttempt);
                            }
                        });
                    
                    allPromises.push(oneShotPromise);
                }
            }
            
            await Promise.all(allPromises);
        } else if (settings.runSelfHealingMode) {
            // One-shot mode disabled, run all workflows in self-healing mode only
            const selfHealingPromises: Promise<WorkflowAttempt>[] = [];
            for (const workflow of workflows) {
                const workflowsIntegrations = integrations.filter(i => workflow.integrationIds.includes(i.id));
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    selfHealingPromises.push(workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, true));
                }
            }
            const selfHealingAttempts = await Promise.all(selfHealingPromises);
            allAttempts.push(...selfHealingAttempts);
        }

        return allAttempts;
    }
}