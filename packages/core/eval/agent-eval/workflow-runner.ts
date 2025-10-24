import { Integration } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { DataStore } from "../../datastore/types.js";
import { TestSuiteSettings, WorkflowAttempt, WorkflowConfig } from "./types.js";
import { SuperglueWorkflowAttemptService } from "./workflow-attempt.js";


export class WorkflowRunnerService {
    constructor(
        private datastore: DataStore,
        private metadata: Metadata
    ) {
    }

    public async runWorkflows(workflows: WorkflowConfig[], integrations: Integration[], settings: TestSuiteSettings): Promise<WorkflowAttempt[]> {
        const workflowAttemptService = new SuperglueWorkflowAttemptService(this.metadata, this.datastore);
        const BATCH_SIZE = 5;

        const runWorkflow = async (workflow: WorkflowConfig): Promise<WorkflowAttempt[]> => {
            const workflowsIntegrations = integrations.filter(i => workflow.integrationIds.includes(i.id));
            const attempts: WorkflowAttempt[] = [];
            
            if (settings.runOneShotMode) {
                const oneShotPromises: Promise<WorkflowAttempt>[] = [];
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    oneShotPromises.push(
                        workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, false)
                    );
                }
                
                const oneShotAttempts = await Promise.all(oneShotPromises);
                attempts.push(...oneShotAttempts);
                
                const hadOneShotSuccess = oneShotAttempts.some(a => a.buildSuccess && a.executionSuccess);
                
                if (settings.runSelfHealingMode && !hadOneShotSuccess) {
                    const selfHealingPromises: Promise<WorkflowAttempt>[] = [];
                    for (let i = 0; i < settings.attemptsEachMode; i++) {
                        selfHealingPromises.push(
                            workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, true)
                        );
                    }
                    
                    const selfHealingAttempts = await Promise.all(selfHealingPromises);
                    attempts.push(...selfHealingAttempts);
                }
            } else if (settings.runSelfHealingMode) {
                const selfHealingPromises: Promise<WorkflowAttempt>[] = [];
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    selfHealingPromises.push(
                        workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, true)
                    );
                }
                
                const selfHealingAttempts = await Promise.all(selfHealingPromises);
                attempts.push(...selfHealingAttempts);
            }
            
            return attempts;
        };

        const allWorkflowAttempts: WorkflowAttempt[] = [];
        for (let i = 0; i < workflows.length; i += BATCH_SIZE) {
            const batch = workflows.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(runWorkflow);
            const batchResults = await Promise.all(batchPromises);
            allWorkflowAttempts.push(...batchResults.flat());
        }

        return allWorkflowAttempts;
    }
}