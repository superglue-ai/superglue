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

        if (settings.runOneShotMode) {
            const oneShotPromises: Promise<WorkflowAttempt>[] = [];
            for (const workflow of workflows) {
                const workflowsIntegrations = integrations.filter(i => workflow.integrationIds.includes(i.id));
                for (let i = 0; i < settings.attemptsEachMode; i++) {
                    oneShotPromises.push(workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, false));
                }
            }
            const oneShotAttempts = await Promise.all(oneShotPromises);
            allAttempts.push(...oneShotAttempts);
        }

        if (settings.runSelfHealingMode) {
            let workflowsToRunSelfHealing: WorkflowConfig[] = [];

            if (settings.runOneShotMode) {
                const failedWorkflowIds = new Set<string>();
                const oneShotAttempts = allAttempts.filter(attempt => !attempt.selfHealingEnabled);
                
                for (const attempt of oneShotAttempts) {
                    if (!attempt.buildSuccess || !attempt.executionSuccess) {
                        failedWorkflowIds.add(attempt.workflowConfig.id);
                    }
                }
                
                workflowsToRunSelfHealing = workflows.filter(workflow => failedWorkflowIds.has(workflow.id));
            } else {
                workflowsToRunSelfHealing = workflows; // If one-shot mode is disabled, run all workflows in self-healing mode
            }

            if (workflowsToRunSelfHealing.length > 0) {
                const selfHealingPromises: Promise<WorkflowAttempt>[] = [];
                for (const workflow of workflowsToRunSelfHealing) {
                    const workflowsIntegrations = integrations.filter(i => workflow.integrationIds.includes(i.id));
                    for (let i = 0; i < settings.attemptsEachMode; i++) {
                        selfHealingPromises.push(workflowAttemptService.runWorkflowAttempt(workflow, workflowsIntegrations, true));
                    }
                }
                const selfHealingAttempts = await Promise.all(selfHealingPromises);
                allAttempts.push(...selfHealingAttempts);
            }
        }

        return allAttempts;
    }
}