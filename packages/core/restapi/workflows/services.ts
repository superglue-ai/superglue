import {  RequestOptions, Workflow } from "@superglue/client";
import { flattenAndNamespaceWorkflowCredentials, generateUniqueId, waitForIntegrationProcessing } from "@superglue/shared/utils";
import { WorkflowExecutor } from "../../workflow/workflow-executor.js";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { logMessage } from "../../utils/logs.js";
import { replaceVariables } from "../../utils/tools.js";
import { WorkflowBuilder } from "../../workflow/workflow-builder.js";
import { createDataStore } from "../../datastore/datastore.js";
import { parseFile } from "../../utils/file.js";
import { FileType } from "@superglue/client";
import crypto from "crypto"


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
  file?: Buffer | string;
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
  let workflow: Workflow | undefined;

  try {
    // Retrieve or validate workflow
    if (args.input.id) {
      workflow = await datastore.getWorkflow({ id: args.input.id, orgId });
      if (!workflow) throw new Error("Workflow not found");
    } else if (args.input.workflow) {
      workflow = args.input.workflow;
      if (!workflow.id || !Array.isArray(workflow.steps)) {
        throw new Error("Workflow must have an ID and a steps array");
      }
    } else {
      throw new Error("Must provide either workflow ID or workflow object");
    }

    if (typeof workflow.inputSchema === 'string') workflow.inputSchema = JSON.parse(workflow.inputSchema);
    if (typeof workflow.responseSchema === 'string') workflow.responseSchema = JSON.parse(workflow.responseSchema);

    // Handle file-to-payload conversion
    let payload = args.payload;
    if (!payload && args.file) {
      const buffer = typeof args.file === 'string' ? Buffer.from(args.file, 'base64') : args.file;
      payload = await parseFile(buffer, FileType.AUTO);
    }

    let mergedCredentials = args.credentials || {};
    let integrationManagers: IntegrationManager[] = [];

    // Collect integration IDs from workflow
    const allIntegrationIds = new Set<string>();
    workflow.integrationIds?.forEach(id => allIntegrationIds.add(id));
    workflow.steps?.forEach(step => step.integrationId && allIntegrationIds.add(step.integrationId));

    // Resolve credentials
    if (allIntegrationIds.size > 0) {
      const ids = Array.from(allIntegrationIds);
      integrationManagers = await IntegrationManager.fromIds(ids, datastore, orgId);
      await Promise.all(integrationManagers.map(i => i.refreshTokenIfNeeded()));
      const creds = flattenAndNamespaceWorkflowCredentials(integrationManagers);

      const processed = await Promise.all(
        Object.entries(args.credentials || {}).map(async ([k, v]) => ({ [k]: await replaceVariables(String(v), creds) }))
      );

      mergedCredentials = Object.assign({}, creds, ...processed);
    }

    // Execute workflow
    const executor = new WorkflowExecutor(workflow, metadata, integrationManagers);
    const result = await executor.execute(payload, mergedCredentials, args.options);

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
      orgId
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
    await datastore.createRun({ result, orgId });
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