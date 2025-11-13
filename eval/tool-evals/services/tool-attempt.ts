import { Metadata } from "@playwright/test";
import { Integration, SelfHealingMode, Workflow, WorkflowResult } from "@superglue/client";
import { generateUniqueId } from "@superglue/shared/utils";
import { ToolBuilder } from "../../../packages/core/build/tool-builder.js";
import { DataStore } from "../../../packages/core/datastore/types.js";
import { WorkflowExecutor } from "../../../packages/core/execute/workflow-executor.js";
import { IntegrationManager } from "../../../packages/core/integrations/integration-manager.js";
import { AttemptStatus, ToolAttempt, ToolConfig, ToolFailureReason, ValidationLLMConfig } from "../types.js";
import { ToolValidationService } from "./tool-validation.js";

export class SuperglueToolAttemptService {
    private validationService: ToolValidationService;

    constructor(
        private metadata: Metadata,
        private datastore: DataStore,
        validationLlmConfig?: ValidationLLMConfig
    ) {
        this.validationService = new ToolValidationService(validationLlmConfig);
    }

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
            status: AttemptStatus.BUILD_FAILED,
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
            attempt.status = AttemptStatus.BUILD_FAILED;

            return attempt;
        }

        const execStart = Date.now();
        try {
            const workflowResult = await this.executeWorkflow(toolConfig, workflow, integrations, selfHealingEnabled);
            attempt.executionTime = Date.now() - execStart;
            attempt.result = workflowResult;

            if (!workflowResult.success) {
                attempt.executionSuccess = false;
                attempt.executionError = this.determineErrorMessage(workflowResult);
                attempt.failureReason = ToolFailureReason.EXECUTION;
                attempt.status = AttemptStatus.EXECUTION_FAILED;
                console.error(`Execution failed: ${attempt.executionError}`);
                return attempt;
            }

            // Execution succeeded - tool ran and returned data
            attempt.executionSuccess = true;

            // Now validate the returned data
            const validationResult = await this.validationService.validate(toolConfig, workflowResult);
            attempt.validationResult = validationResult;
            attempt.status = this.validationService.determineStatus(attempt);

            // Set failure reason if validation didn't pass
            if (!validationResult.passed) {
                attempt.failureReason = ToolFailureReason.VALIDATION;
            }

            return attempt;
        } catch (error) {
            attempt.executionTime = Date.now() - execStart;
            attempt.executionError = error instanceof Error ? error.message : String(error);
            attempt.failureReason = ToolFailureReason.EXECUTION;
            attempt.status = AttemptStatus.EXECUTION_FAILED;
            
            return attempt;
        }
    }

    private async buildWorkflow(
        toolConfig: ToolConfig,
        integrations: Integration[]
    ): Promise<Workflow> {
        const builder = new ToolBuilder(
            toolConfig.instruction,
            integrations,
            toolConfig.payload || {},
            {},
            this.metadata
        );

        const workflow = await builder.buildTool();
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
            { workflow, metadata: this.metadata, integrations: IntegrationManager.fromIntegrations(integrations, this.datastore, this.metadata.orgId) }
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
            { payload: toolConfig.payload || {}, credentials: allCredentials, options: { selfHealing: selfHealingEnabled ? SelfHealingMode.ENABLED : SelfHealingMode.DISABLED, testMode: selfHealingEnabled ? true : false } }
        );

        return workflowResult;
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
