import {  RequestOptions, Workflow } from "@superglue/client";
import { flattenAndNamespaceWorkflowCredentials, generateUniqueId, waitForIntegrationProcessing } from "@superglue/shared/utils";
import { WorkflowExecutor } from "../../workflow/workflow-executor.js";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { logMessage } from "../../utils/logs.js";
import { replaceVariables } from "../../utils/tools.js";
import { WorkflowBuilder } from "../../workflow/workflow-builder.js";
import { createDataStore } from "../../datastore/datastore.js";



const datastore = createDataStore({
    type: String(process.env.DATASTORE_TYPE || 'memory').toLowerCase() as 'redis' | 'memory' | 'file' | 'postgres',
});

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
    if (newValue === null) return undefined;
    if (newValue !== undefined) return newValue;
    if (oldValue !== undefined) return oldValue;
    return defaultValue;
}

interface ExecuteWorkflowArgs {
  input: { workflow: Workflow; id?: never } | { workflow?: never; id: string };
  payload?: any;
  credentials?: any;
  options?: RequestOptions;
}

interface BuildWorkflowArgs {
  instruction: string;
  payload?: Record<string, unknown>;
  integrationIds: string[];
  responseSchema?: JSONSchema;
}

export const listWorkflowsService = async ({ orgId, limit, offset }: { orgId: string, limit: number, offset: number }) => {
    try {
      return await datastore.listWorkflows({ orgId, limit, offset });
    } catch (error) {
      console.error("Error listing workflows:", error);
      throw new Error('Internal server error');
    }
};


export const getWorkflowService = async ({ id, orgId }: { id: string, orgId: string }) => {
    if (!id) {
        throw new Error("id is required");
    }

    const workflow = await datastore.getWorkflow({ id, orgId });
    if (!workflow) {
        throw new Error("Workflow not found");
    }

    workflow.steps.forEach((step: any) => {
        if (!step.apiConfig.id) {
            step.apiConfig.id = step.id;
        }
    });

    return workflow;
};


export const upsertWorkflowService = async (id: string, input: any, orgId: any) => {
    if (!id) {
        throw new Error("id is required");
    }

    const now = new Date();
    const oldWorkflow = await datastore.getWorkflow({ id, orgId: orgId });

    const workflow = {
        id,
        steps: resolveField(input.steps, oldWorkflow?.steps, []),
        integrationIds: resolveField(input.integrationIds, oldWorkflow?.integrationIds, []),
        inputSchema: resolveField(input.inputSchema, oldWorkflow?.inputSchema),
        finalTransform: resolveField(input.finalTransform, oldWorkflow?.finalTransform, "$"),
        responseSchema: resolveField(input.responseSchema, oldWorkflow?.responseSchema),
        instruction: resolveField(input.instruction, oldWorkflow?.instruction),
        createdAt: oldWorkflow?.createdAt || now,
        updatedAt: now
    };

    workflow.steps.forEach((step: any) => {
        if (!step.apiConfig.id) {
            step.apiConfig.id = step.id;
        }
    });

    return await datastore.upsertWorkflow({ id, workflow, orgId: orgId });
};



export const deleteWorkflowService = async (id: string, orgId: string) => {
    const workflow = await datastore.getWorkflow({ id, orgId });

    if (!workflow) {
        throw new Error(`Workflow with ID '${id}' not found.`);
    }

    return await datastore.deleteWorkflow({ id, orgId });
};



export const executeWorkflowService = async (orgId: any, args: ExecuteWorkflowArgs, info?: any) => {
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const metadata = { orgId: orgId, runId };
  let workflow: any = undefined;

  try {
    if (args.input.id) {
      workflow = await datastore.getWorkflow({ id: args.input.id, orgId: orgId });
      if (!workflow) throw new Error("Workflow not found");
    } else if (args.input.workflow) {
      workflow = args.input.workflow;
      if (!workflow.id) throw new Error("Workflow must have an ID");
      if (!workflow.steps || !Array.isArray(workflow.steps)) throw new Error("Workflow must have steps array");
      logMessage('info', `Executing workflow ${workflow.id}`, metadata);
    } else {
      throw new Error("Must provide either workflow ID or workflow object");
    }

    if (typeof workflow.inputSchema === 'string') {
      workflow.inputSchema = JSON.parse(workflow.inputSchema);
    }
    if (typeof workflow.responseSchema === 'string') {
      workflow.responseSchema = JSON.parse(workflow.responseSchema);
    }

    let mergedCredentials = args.credentials || {};
    let integrationManagers: IntegrationManager[] = [];

    // Get all integration IDs
    const allIntegrationIds = new Set<string>();
    workflow.integrationIds?.forEach((id: string) => allIntegrationIds.add(id));
    workflow.steps?.forEach((step: any) => {
      if (step.integrationId) {
        allIntegrationIds.add(step.integrationId);
      }
    });

    if (allIntegrationIds.size > 0) {
      const requestedIds = Array.from(allIntegrationIds);
      integrationManagers = await IntegrationManager.fromIds(requestedIds, datastore, orgId);

      await Promise.all(integrationManagers.map(i => i.refreshTokenIfNeeded()));
      const integrationCreds = flattenAndNamespaceWorkflowCredentials(integrationManagers);

      const processedCredentials = await Promise.all(
        Object.entries(args.credentials || {}).map(async ([key, value]) => {
          return { [key]: await replaceVariables(String(value), integrationCreds) };
        })
      );

      mergedCredentials = Object.assign({}, integrationCreds, ...processedCredentials);
    }

    const executor = new WorkflowExecutor(workflow, metadata, integrationManagers);
    const result = await executor.execute(args.payload, mergedCredentials, args.options);

    await datastore.createRun({
      result: {
        id: runId,
        success: result.success,
        error: result.error || undefined,
        config: result.config || workflow,
        stepResults: [],
        startedAt,
        completedAt: new Date()
      },
      orgId: orgId
    });

    return result;

  } catch (error) {
    logMessage('error', "Workflow execution error: " + String(error), metadata);
    const result = {
      id: runId,
      success: false,
      config: workflow || { id: args.input.id, steps: [] },
      error: String(error),
      stepResults: [],
      startedAt,
      completedAt: new Date()
    };
    await datastore.createRun({ result, orgId: orgId });
    return { ...result, data: {}, stepResults: [] };
  }
};



export const buildWorkflowService = async (orgId: any, args: BuildWorkflowArgs) => {
  const metadata = { orgId: orgId, runId: crypto.randomUUID() };
  const { instruction, payload = {}, integrationIds, responseSchema } = args;

  if (!instruction || instruction.trim() === "") {
    throw new Error("Instruction is required to build a workflow.");
  }

  if (!integrationIds || integrationIds.length === 0) {
    throw new Error("At least one integration is required.");
  }

  const datastoreAdapter = {
    getManyIntegrations: async (ids: string[]) => {
      return await datastore.getManyIntegrations({
        ids,
        includeDocs: true,
        orgId: orgId
      });
    }
  };

  const resolvedIntegrations = await waitForIntegrationProcessing(datastoreAdapter, integrationIds);

  const builder = new WorkflowBuilder(
    instruction,
    resolvedIntegrations,
    payload,
    responseSchema,
    metadata
  );

  const workflow = await builder.buildWorkflow();

  workflow.id = await generateUniqueId({
    baseId: workflow.id,
    exists: async (id) =>
      !!(await datastore.getWorkflow({ id, orgId: orgId }))
  });

  return workflow;
};