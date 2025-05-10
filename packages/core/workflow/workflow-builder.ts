import { generateApiConfig } from "../utils/api.js";
import { type Workflow, type ExecutionStep, type ApiConfig, type ExecutionMode, type Metadata, CacheMode } from "@superglue/shared";
import { object, z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { applyJsonata, composeUrl } from "../utils/tools.js"; // Assuming path
import { LanguageModel } from "../llm/llm.js";
import { PLANNING_PROMPT } from "../llm/prompts.js";
import { logMessage } from "../utils/logs.js"; // Added import
import { Documentation } from "../utils/documentation.js";
import { executeApiCall } from "../graphql/resolvers/call.js";
import { generateMapping, prepareTransform } from "../utils/transform.js";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { WorkflowExecutor } from "./workflow-executor.js";
import { selectStrategy } from "./workflow-strategies.js";
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
  urlHost?: string;
  urlPath?: string;
  instruction: string;
  mode: ExecutionMode;
  loopSelector?: string;
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
  private responseSchema: JSONSchema;

  constructor(
    systems: SystemDefinition[],
    instruction: string,
    initialPayload: Record<string, unknown>,
    responseSchema: JSONSchema,
    metadata: Metadata
  ) {
    this.systems = systems.reduce((acc, sys) => {
      acc[sys.id] = sys;
      return acc;
    }, {} as Record<string, SystemDefinition>);
    this.instruction = instruction;
    this.initialPayload = initialPayload;
    this.metadata = metadata;
    this.responseSchema = responseSchema;
  }

  private async planWorkflow(): Promise<WorkflowPlan> {
    const planSchema = zodToJsonSchema(z.object({
      steps: z.array(z.object({
        stepId: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails', 'updateOrderStatus')."),
        systemId: z.string().describe("The ID of the system (from the provided list) to use for this step."),
        instruction: z.string().describe("A specific, concise instruction for what this single API call should achieve (e.g., 'Get user profile by email', 'Create a new order')."),
        mode: z.enum(["DIRECT", "LOOP"]).describe("The mode of execution for this step. Use 'DIRECT' for simple calls executed once or 'LOOP' for iterative processes."),
        loopSelector: z.string().describe("If mode is loop: The JSONata expression to use for selecting the next iteration of a loop. Use '$' if no selection is needed."),
        urlHost: z.string().describe("The host of the API to use for this step. Mostly this will be the same as the system's urlHost."),
        urlPath: z.string().describe("The path of the API to use for this step. This might be different from the system's urlPath, if the API call is for a specific endpoint.")
      })).describe("The sequence of steps required to fulfill the overall instruction.")
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

    return {
      ...plan,
      finalTransform: "$"
    } as WorkflowPlan;
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
      system.documentation = await documentation.fetch(this.instruction);
    }
  }


  public async build(): Promise<Workflow> {
    await this.fetchDocumentation();
    const plan = await this.planWorkflow();
    const executionSteps: ExecutionStep[] = [];

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
        urlHost: plannedStep.urlHost,
        urlPath: plannedStep.urlPath,
        documentationUrl: system.documentationUrl || system.documentation
      };
      const executionStep: ExecutionStep = {
        id: plannedStep.stepId,
        apiConfig: partialApiConfig,
        executionMode: plannedStep.mode,
        loopSelector: "$",
        inputMapping: "$",
        responseMapping: "$", // Default: takes the whole step output
        // loopSelector, loopMaxIters would need to come from planning
      };
      executionSteps.push(executionStep);
    }

    const allCredentials = Object.values(this.systems).reduce((acc, sys) => {
      return { ...acc, ...sys.credentials };
    }, {});

    const workflow: Workflow = {
      id: `wf-${Math.random().toString(36).substring(2, 8)}`,
      steps: executionSteps,
      finalTransform: "$",
      responseSchema: this.responseSchema,
    };

    const executor = new WorkflowExecutor(workflow, this.metadata);
    const result = await executor.execute(this.initialPayload, allCredentials, {
      cacheMode: CacheMode.DISABLED
    });

    if(!result.success) {
      throw new Error(result.error);
    }

    return {
      id: workflow.id,
      steps: executor.steps,
      finalTransform: executor.finalTransform,
      responseSchema: executor.responseSchema,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }
}
