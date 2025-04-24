import { generateApiConfig } from "../utils/api.js";
import type { Workflow, ExecutionStep, ApiConfig, HttpMethod, AuthType, Pagination, PaginationType } from "@superglue/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { composeUrl } from "../utils/tools.js"; // Assuming path
import { LanguageModel } from "../llm/llm.js";
import { Documentation } from "../utils/documentation.js";

// Define the structure for system input
interface SystemDefinition {
  id: string;
  urlHost: string;
  urlPath?: string;
  credentials: Record<string, any>; // Actual credential values for building
  documentationUrl?: string;
  // Potentially add headers/params needed specifically for fetching documentation if secured
  documentationHeaders?: Record<string, string>;
  documentationQueryParams?: Record<string, string>;
}

// Define the structure for the output of the planning step
interface WorkflowPlanStep {
  stepId: string;
  systemId: string;
  instruction: string;
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

  constructor(
    systems: SystemDefinition[],
    instruction: string,
    initialPayload: Record<string, unknown>
  ) {
    this.systems = systems.reduce((acc, sys) => {
      acc[sys.id] = sys;
      return acc;
    }, {} as Record<string, SystemDefinition>);
    this.instruction = instruction;
    this.initialPayload = initialPayload;
  }

  private async planWorkflow(): Promise<WorkflowPlan> {
    const planSchema = zodToJsonSchema(z.object({
      steps: z.array(z.object({
        stepId: z.string().describe("Unique camelCase identifier for the step (e.g., 'fetchCustomerDetails', 'updateOrderStatus')."),
        systemId: z.string().describe("The ID of the system (from the provided list) to use for this step."),
        instruction: z.string().describe("A specific, concise instruction for what this single API call should achieve (e.g., 'Get user profile by email', 'Create a new order').")
      })).min(1).describe("The sequence of steps required to fulfill the overall instruction."),
      finalTransform: z.string().optional().describe("Optional JSONata expression to apply to the final aggregated results of all steps. Use '$' if no transformation is needed.")
    }));

    const systemDescriptions = Object.values(this.systems).map(sys =>
      `- System ID: ${sys.id}\n  Base URL: ${composeUrl(sys.urlHost, sys.urlPath)}\n  Docs URL: ${sys.documentationUrl || 'N/A'}\n  Credentials available: ${Object.keys(sys.credentials).join(', ') || 'None'}`
    ).join("\n");

    const planningPrompt = `
      You need to create a plan to fulfill a user's request by orchestrating calls across several systems.
      Generate a sequence of steps, where each step involves calling one API endpoint.

      Overall Instruction:
      "${this.instruction}"

      Available Systems:
      ${systemDescriptions}

      Initial Input Payload contains keys: ${Object.keys(this.initialPayload).join(", ") || 'None'}

      Your task is to output a JSON object conforming to the WorkflowPlan schema. Define the necessary steps, assigning a unique \`stepId\`, selecting the appropriate \`systemId\` for each step, and writing a clear \`instruction\` for that specific API call. Assume data from previous steps will be available implicitly for subsequent steps (e.g., if step 1 fetches a customer ID, step 2 can use it). If the final output needs restructuring, provide a \`finalTransform\` JSONata expression.
    `;

    console.log("Planning workflow with prompt:", planningPrompt); // Logging for debug
    const { response: plan } = await LanguageModel.generateObject(
      [{ role: "user", content: planningPrompt }],
      planSchema
    );
    console.log("Received plan:", plan); // Logging for debug

    if (!plan || !plan.steps || plan.steps.length === 0) {
        throw new Error("Workflow planning failed to produce valid steps.");
    }

    return plan as WorkflowPlan;
  }

  private async getSystemDocumentation(system: SystemDefinition): Promise<string> {
      if (!system.documentationUrl) {
          return '';
      }

      console.log(`Fetching documentation for system ${system.id} from ${system.documentationUrl || 'auto-detect GraphQL'}`);
      // Use system-specific headers/params if provided, else empty objects
      const headers = system.documentationHeaders || {};
      const queryParams = system.documentationQueryParams || {};

      const documentation = new Documentation({ 
        urlHost: system.urlHost,
        urlPath: system.urlPath,
        documentationUrl: system.documentationUrl || '',
        headers,
        queryParams,
        instruction: ''
      });
      const result = await documentation.fetch();
      console.log(`Fetched documentation for system ${system.id}. Length: ${result.length}`); // Logging for debug
      return result;
  }


  public async build(): Promise<Workflow> {
    const plan = await this.planWorkflow();
    const executionSteps: ExecutionStep[] = [];
    let currentContext = { ...this.initialPayload }; // Start with initial payload

    for (const plannedStep of plan.steps) {
      const system = this.systems[plannedStep.systemId];
      if (!system) {
        throw new Error(`Configuration error: System with ID "${plannedStep.systemId}" planned for step "${plannedStep.stepId}" not found in provided systems.`);
      }

      const documentation = await this.getSystemDocumentation(system);

      const partialApiConfig: Partial<ApiConfig> = {
        instruction: plannedStep.instruction,
        urlHost: system.urlHost,
        urlPath: system.urlPath,
        documentationUrl: system.documentationUrl, // Store for reference, though content is fetched
      };

      console.log(`Generating API config for step ${plannedStep.stepId}...`);
      // Pass current context as payload, allowing generateApiConfig to potentially use previous step results
      const { config: generatedApiConfig } = await generateApiConfig(
        partialApiConfig,
        documentation,
        currentContext, // Provide data from previous steps + initial payload
        system.credentials // Pass actual credential values
        // TODO: Consider adding retry logic or passing messages for generateApiConfig if needed
      );
      console.log(`Generated API config for step ${plannedStep.stepId}:`, generatedApiConfig);


      const executionStep: ExecutionStep = {
        id: plannedStep.stepId,
        apiConfig: generatedApiConfig,
        // Defaults - Planning/generation could potentially refine these later
        executionMode: "DIRECT",
        inputMapping: "$", // Default: assumes generateApiConfig uses context correctly
        responseMapping: "$", // Default: takes the whole step output
        // loopSelector, loopMaxIters would need to come from planning
      };
      executionSteps.push(executionStep);

      // --- CRITICAL PART FOR STEP DEPENDENCIES ---
      // How do we update `currentContext`? We don't have the *actual* result yet.
      // `generateApiConfig` only *defines* the call.
      // Option 1 (Simplistic): Assume `generateApiConfig` correctly uses the payload variables passed in `currentContext`.
      // Option 2 (More Complex): The planning phase needs to explicitly define output variable names per step,
      //             and the builder simulates adding hypothetical outputs to the context for subsequent `generateApiConfig` calls.
      // Option 3 (Requires Execution Simulation): Actually *execute* a dry-run or use mocked data during build, which is very complex.

      // Let's stick with Option 1 for now: Assume `generateApiConfig` is smart enough given the instruction and context keys.
      // We don't update `currentContext` here, as the actual data isn't known until execution.
      // The `inputMapping` would need refinement if complex data passing is needed beyond what generateApiConfig handles implicitly.
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

    console.log("Workflow built successfully:", workflow);
    return workflow;
  }
}
