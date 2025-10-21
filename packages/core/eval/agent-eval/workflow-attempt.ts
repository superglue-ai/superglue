import { Integration, SelfHealingMode, Workflow, WorkflowResult } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { generateUniqueId } from "@superglue/shared/utils";
import { DataStore } from "../../datastore/types.js";
import { WorkflowRunner } from "../../execute/workflow-runner.js";
import { WorkflowBuilder } from "../../generate/workflow.js";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { WorkflowAttempt, WorkflowConfig, WorkflowFailureReason } from "./types.js";
import { isDeepEqual } from "./utils.js";

export class SuperglueWorkflowAttemptService {
    constructor(
        private metadata: Metadata,
        private datastore: DataStore
    ) {}

    public async runWorkflowAttempt(
        workflowConfig: WorkflowConfig,
        integrations: Integration[],
        selfHealingEnabled: boolean = true
    ): Promise<WorkflowAttempt> {
        const attempt: WorkflowAttempt = {
            workflowConfig,
            selfHealingEnabled: selfHealingEnabled,
            buildTime: null,
            buildSuccess: false,
            executionTime: null,
            executionSuccess: false,
            createdAt: new Date(),
        };

        const buildStart = Date.now();
        let workflow: Workflow | undefined;
        try {
            workflow = await this.buildWorkflow(workflowConfig, integrations);

            attempt.buildSuccess = true;
            attempt.workflow = workflow;
            attempt.buildTime = Date.now() - buildStart;
        } catch (error) {
            attempt.buildTime = Date.now() - buildStart;
            attempt.buildError = error instanceof Error ? error.message : String(error);
            attempt.failureReason = WorkflowFailureReason.BUILD;

            return attempt;
        }

        const execStart = Date.now();
        try {
            const workflowResult = await this.executeWorkflow(workflowConfig, workflow, integrations, selfHealingEnabled);
            attempt.executionTime = Date.now() - execStart;

            if (workflowResult.success && !this.validateResult(workflowConfig, workflowResult)) {
                const truncatedResult = JSON.stringify(workflowResult.data).substring(0, 100);
                attempt.executionSuccess = false;
                attempt.executionError = `Data did not match manually defined expected data. Truncated data: ${truncatedResult}`;
                attempt.failureReason = WorkflowFailureReason.STRICT_VALIDATION;
                attempt.result = workflowResult;

                return attempt;
            }

            attempt.result = workflowResult;
            attempt.executionSuccess = workflowResult.success;
            attempt.executionError = this.determineErrorMessage(workflowResult);
            attempt.failureReason = workflowResult.success ? undefined : WorkflowFailureReason.EXECUTION;

            return attempt;
        } catch (error) {
            attempt.executionTime = Date.now() - execStart;
            attempt.executionError = error instanceof Error ? error.message : String(error);
            attempt.failureReason = WorkflowFailureReason.EXECUTION;
            
            return attempt;
        }
    }

    private async buildWorkflow(
        workflowConfig: WorkflowConfig,
        integrations: Integration[]
    ): Promise<Workflow> {
        const builder = new WorkflowBuilder(
            workflowConfig.instruction,
            integrations,
            workflowConfig.payload || {},
            {},
            this.metadata
        );

        const workflow = await builder.buildWorkflow();
        workflow.id = await generateUniqueId({
            baseId: workflow.id,
            exists: async (id) =>
                !!(await this.datastore.getWorkflow({
                    id,
                    orgId: this.metadata.orgId,
                })),
        });

        return workflow;
    }

    private async executeWorkflow(
        workflowConfig: WorkflowConfig,
        workflow: Workflow,
        integrations: Integration[],
        selfHealingEnabled: boolean
    ): Promise<WorkflowResult> {
        const executor = new WorkflowRunner(
            workflow,
            this.metadata,
            IntegrationManager.fromIntegrations(
                integrations,
                this.datastore,
                this.metadata.orgId
            )
        );

        const allCredentials = integrations.reduce(
            (acc, integ) => {
                if (integ.credentials && typeof integ.credentials === "object") {
                    for (const [key, value] of Object.entries(integ.credentials)) {
                        acc[`${integ.id}_${key}`] = value;
                    }
                }
                return acc;
            },
            {} as Record<string, string>
        );

        const workflowResult = await executor.execute(
            workflowConfig.payload || {},
            allCredentials,
            {
                selfHealing: selfHealingEnabled ? SelfHealingMode.ENABLED : SelfHealingMode.DISABLED
            }
        );

        return workflowResult;
    }

    private validateResult(workflowConfig: WorkflowConfig, workflowResult: WorkflowResult): boolean {
        if (!workflowConfig.expectedData || Object.keys(workflowConfig.expectedData).length === 0) { // empty object evaluates to valid
            return true;
        }

        if (typeof workflowConfig.expectedData === 'string') {
            return workflowResult.data === workflowConfig.expectedData;
        }

        if (typeof workflowConfig.expectedData === 'object') {
            return isDeepEqual(workflowConfig.expectedData, workflowResult.data, workflowConfig.allowAdditionalProperties ?? false);
        }

        return false;
    }

    private determineErrorMessage(workflowResult: WorkflowResult): string | undefined {
        if (workflowResult.success) {
            return;
        }

        if (typeof workflowResult.error === 'string') {
            return workflowResult.error;
        }

        if (typeof workflowResult.error === 'object') {
            return JSON.stringify(workflowResult.error);
        }

        return 'Unknown error';
    }
}
