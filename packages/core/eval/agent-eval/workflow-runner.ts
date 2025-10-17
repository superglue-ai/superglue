import { Integration } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { DataStore } from "../../datastore/types.js";
import { WorkflowAttempt, WorkflowConfig } from "./types.js";
import { SuperglueWorkflowAttemptService } from "./workflow-attempt.js";

export class WorkflowRunnerService {
    constructor(
        private datastore: DataStore,
        private metadata: Metadata
    ) {
    }

    public async runWorkflows(workflows: WorkflowConfig[], integrations: Integration[]): Promise<WorkflowAttempt[]> {
        const workflowAttemptService = new SuperglueWorkflowAttemptService(this.metadata, this.datastore);

        const attemptPromises: Promise<WorkflowAttempt>[] = workflows.flatMap(workflow => {
            const workflowsIntegrations = integrations.filter(i => workflow.integrationIds.includes(i.id));
            
            return [
                workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, true),
                workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, false)
            ];
        });

        return await Promise.all(attemptPromises);
    }
}