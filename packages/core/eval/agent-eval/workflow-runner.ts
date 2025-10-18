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

        const attemptPromises: Promise<WorkflowAttempt>[] = workflows.flatMap(workflow => {
            const workflowsIntegrations = integrations.filter(i => workflow.integrationIds.includes(i.id));
            
            const attempts: Promise<WorkflowAttempt>[] = [];
            for (let i = 0; i < settings.attempts; i++) {
                if (settings.runSelfHealingMode) {
                    attempts.push(workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, true));
                }
                if (settings.runOneShotMode) {
                    attempts.push(workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, false));
                }
            }

            return attempts;
        });

        return await Promise.all(attemptPromises);
    }
}