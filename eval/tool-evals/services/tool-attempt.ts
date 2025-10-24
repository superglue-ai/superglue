import { Integration, RequestOptions, SelfHealingMode, WorkflowResult } from "@superglue/client";
import { ToolAttempt, ToolConfig, ToolFailureReason } from "../types.js";
import { Metadata } from "@playwright/test";
import { Workflow } from "@superglue/client";
import { generateUniqueId } from "@superglue/shared/utils";
import { IntegrationManager } from "../../../packages/core/integrations/integration-manager.js";
import { DataStore } from "../../../packages/core/datastore/types.js";
import { isDeepEqual } from "../utils/utils.js";
import { WorkflowBuilder } from "../../../packages/core/build/workflow-builder.js";
import { WorkflowExecutor } from "../../../packages/core/execute/workflow-executor.js";

export class SuperglueToolAttemptService {
    constructor(
        private metadata: Metadata,
        private datastore: DataStore
    ) {}

    public async runToolAttempt(
        toolConfig: ToolConfig,
        integrations: Integration[],
        selfHealingEnabled: boolean = true
    ): Promise<ToolAttempt> {
        const attempt: ToolAttempt = {
            toolConfig,
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
            workflow = await this.buildWorkflow(toolConfig, integrations);

            attempt.buildSuccess = true;
            attempt.workflow = workflow;
            attempt.buildTime = Date.now() - buildStart;
        } catch (error) {
            attempt.buildTime = Date.now() - buildStart;
            attempt.buildError = error instanceof Error ? error.message : String(error);
            attempt.failureReason = ToolFailureReason.BUILD;

            return attempt;
        }

        const execStart = Date.now();
        try {
            const workflowResult = await this.executeWorkflow(toolConfig, workflow, integrations, selfHealingEnabled);
            attempt.executionTime = Date.now() - execStart;

            if (workflowResult.success && !this.validateResult(toolConfig, workflowResult)) {
                const truncatedResult = JSON.stringify(workflowResult.data).substring(0, 100);
                attempt.executionSuccess = false;
                attempt.executionError = `Data did not match manually defined expected data. Truncated data: ${truncatedResult}`;
                attempt.failureReason = ToolFailureReason.STRICT_VALIDATION;
                attempt.result = workflowResult;

                return attempt;
            }

            attempt.result = workflowResult;
            attempt.executionSuccess = workflowResult.success;
            attempt.executionError = this.determineErrorMessage(workflowResult);
            attempt.failureReason = workflowResult.success ? undefined : ToolFailureReason.EXECUTION;

            return attempt;
        } catch (error) {
            attempt.executionTime = Date.now() - execStart;
            attempt.executionError = error instanceof Error ? error.message : String(error);
            attempt.failureReason = ToolFailureReason.EXECUTION;
            
            return attempt;
        }
    }

    private async buildWorkflow(
        toolConfig: ToolConfig,
        integrations: Integration[]
    ): Promise<Workflow> {
        const builder = new WorkflowBuilder(
            toolConfig.instruction,
            integrations,
            toolConfig.payload || {},
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
        toolConfig: ToolConfig,
        workflow: Workflow,
        integrations: Integration[],
        selfHealingEnabled: boolean
    ): Promise<WorkflowResult> {
        const executor = new WorkflowExecutor(
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
            toolConfig.payload || {},
            allCredentials,
            {
                selfHealing: selfHealingEnabled ? SelfHealingMode.ENABLED : SelfHealingMode.DISABLED
            }
        );

        return workflowResult;
    }

    private validateResult(toolConfig: ToolConfig, workflowResult: WorkflowResult): boolean {
        if (!toolConfig.expectedData || Object.keys(toolConfig.expectedData).length === 0) { // empty object evaluates to valid
            return true;
        }

        if (typeof toolConfig.expectedData === 'string') {
            return workflowResult.data === toolConfig.expectedData;
        }

        if (typeof toolConfig.expectedData === 'object') {
            return isDeepEqual(toolConfig.expectedData, workflowResult.data, toolConfig.allowAdditionalProperties ?? false);
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
