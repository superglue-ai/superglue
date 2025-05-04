import { generateApiConfig } from "../utils/api.js";
import type { Workflow, ExecutionStep, ApiConfig, ExecutionMode, Metadata } from "@superglue/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { applyJsonata, composeUrl } from "../utils/tools.js"; // Assuming path
import { LanguageModel } from "../llm/llm.js";
import { PLANNING_PROMPT } from "../llm/prompts.js";
import { logMessage } from "../utils/logs.js"; // Added import
import { Documentation } from "../utils/documentation.js";
import { executeApiCall } from "../graphql/resolvers/call.js";

// Define the structure for system input
export interface SystemDefinition {
  id: string;
  urlHost: string;
  urlPath?: string;
  credentials: Record<string, any>;
  documentationUrl?: string;
  documentation?: string;
}

// Define the structure for the output of the planning step
interface WorkflowPlanStep {
  stepId: string;
  systemId: string;
  instruction: string;
  mode: ExecutionMode;
  // Future enhancement: Add fields for suggested input/output mapping or looping
}

interface WorkflowPlan {
  steps: WorkflowPlanStep[];
  finalTransform?: string;
}

export class WorkflowBuilder {
  private systems: Record<string, SystemDefinition>;
  private instruction: string;
  private initialPayload: Record<string, unknown>;
  private metadata: Metadata;

  constructor(
    systems: SystemDefinition[],
    instruction: string,
    initialPayload: Record<string, unknown>,
    metadata: Metadata
  ) {
    this.systems = systems.reduce((acc, sys) => {
      acc[sys.id] = sys;
      return acc;
    }, {} as Record<string, SystemDefinition>);
    this.instruction = instruction;
    this.initialPayload = initialPayload;
    this.metadata = metadata;
  }

  private async planWorkflow(): Promise<WorkflowPlan> {
    const planSchema = zodToJsonSchema(z.object({
      steps: z.array(z.object({
        stepId: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails', 'updateOrderStatus')."),
        systemId: z.string().describe("The ID of the system (from the provided list) to use for this step."),
        instruction: z.string().describe("A specific, concise instruction for what this single API call should achieve (e.g., 'Get user profile by email', 'Create a new order')."),
        mode: z.enum(["DIRECT", "LOOP"]).describe("The mode of execution for this step. Use 'DIRECT' for simple calls executed once or 'LOOP' for iterative processes.")
      })).min(1).describe("The sequence of steps required to fulfill the overall instruction."),
      finalTransform: z.string().optional().describe("Optional JSONata expression to apply to the final aggregated results of all steps. Use '$' if no transformation is needed.")
    }));

    const systemDescriptions = Object.values(this.systems).map(sys =>`
--- System ID: ${sys.id} ---
Base URL: ${composeUrl(sys.urlHost, sys.urlPath)}
Credentials available: ${Object.keys(sys.credentials).join(', ') || 'None'}
Documentation:
\`\`\`
${sys.documentation || 'No documentation content available.'}
\`\`\``
    ).join("\n");

    const userPrompt = `
Create a plan to fulfill the user's request by orchestrating single API calls across the available systems.

Overall Instruction:
"${this.instruction}"

Available Systems and their API Documentation:
${systemDescriptions}

Initial Input Payload contains keys: ${Object.keys(this.initialPayload).join(", ") || 'None'}
Payload example: ${JSON.stringify(this.initialPayload)}

Output a JSON object conforming to the WorkflowPlan schema. Define the necessary steps, assigning a unique lowercase \`stepId\`, selecting the appropriate \`systemId\`, writing a clear \`instruction\` for that specific API call based on documentation, and setting the execution \`mode\`. Assume data from previous steps is available implicitly for subsequent steps.
    `;
    const { response: plan } = await LanguageModel.generateObject(
      [
        { role: "system", content: PLANNING_PROMPT },
        { role: "user", content: userPrompt }
      ],
      planSchema
    );
    // console.log("Received plan:", plan); // Logging for debug
    logMessage('info', `Received workflow plan`, this.metadata);

    if (!plan || !plan.steps || plan.steps.length === 0) {
        const errorMsg = "Workflow planning failed to produce valid steps.";
        logMessage('error', errorMsg, this.metadata);
        throw new Error(errorMsg);
    }

    return plan as WorkflowPlan;
  }

  private async fetchDocumentation(): Promise<void> {
    for(const system of Object.values(this.systems)) {
      if(system.documentation) {
        continue;
      }
      const documentation = new Documentation({
        urlHost: system.urlHost,
        urlPath: system.urlPath,
        documentationUrl: system.documentationUrl
      }, this.metadata);
      system.documentation = await documentation.fetch();
    }
  }


  public async build(): Promise<Workflow> {
    await this.fetchDocumentation();
    const plan = await this.planWorkflow();
    const executionSteps: ExecutionStep[] = [];
    let currentContext = { ...this.initialPayload }; // Start with initial payload

    for (const plannedStep of plan.steps) {
      const system = this.systems[plannedStep.systemId];
      if (!system) {
        const errorMsg = `Configuration error: System with ID "${plannedStep.systemId}" planned for step "${plannedStep.stepId}" not found in provided systems.`;
        logMessage('error', errorMsg, this.metadata);
        throw new Error(errorMsg);
      }

      const partialApiConfig: ApiConfig = {
        id: plannedStep.stepId,
        instruction: plannedStep.instruction,
        urlHost: system.urlHost,
        urlPath: system.urlPath,
        documentationUrl: system.documentationUrl
      };
      const apiResult = await executeApiCall(
        partialApiConfig,
        currentContext,
        system.credentials,
        { },
        this.metadata
      );
      currentContext[plannedStep.stepId] = apiResult.data;

      const executionStep: ExecutionStep = {
        id: plannedStep.stepId,
        apiConfig: apiResult.endpoint,
        executionMode: plannedStep.mode,
        inputMapping: "$",
        responseMapping: "$", // Default: takes the whole step output
        // loopSelector, loopMaxIters would need to come from planning
      };
      executionSteps.push(executionStep);
    }

    const workflowId = `wf-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const workflow: Workflow = {
      id: workflowId,
      steps: executionSteps,
      finalTransform: plan.finalTransform || "$", // Use planned transform or default ('$' means identity)
      // Metadata like version, createdAt, etc., would typically be added by a management layer when saving
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return workflow;
  }
}
