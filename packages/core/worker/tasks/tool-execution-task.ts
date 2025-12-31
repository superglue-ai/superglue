import { ToolResult } from "@superglue/shared";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { ToolExecutor } from "../../tools/tool-executor.js";
import { ToolExecutionPayload, ToolExecutionResult } from "../types.js";

export async function run(payload: ToolExecutionPayload): Promise<ToolExecutionResult> {
  const startedAt = new Date();
  const metadata = { orgId: payload.orgId, traceId: payload.traceId };

  try {
    const integrationManagers = payload.integrations.map(
      (integration) => new IntegrationManager(integration, null, metadata),
    );

    const executor = new ToolExecutor({
      tool: payload.workflow,
      metadata,
      integrations: integrationManagers,
    });

    const result: ToolResult = await executor.execute({
      payload: payload.payload,
      credentials: payload.credentials,
      options: payload.options,
    });

    return {
      runId: payload.runId,
      success: result.success,
      data: result.data,
      error: result.error,
      stepResults: result.stepResults,
      config: result.config,
      startedAt,
      completedAt: new Date(),
    };
  } catch (error) {
    return {
      runId: payload.runId,
      success: false,
      data: undefined,
      error: String(error),
      stepResults: [],
      config: payload.workflow,
      startedAt,
      completedAt: new Date(),
    };
  }
}
