import axios from "axios";
import {
  BuildToolArgs,
  CredentialMode,
  ExtractArgs,
  ExtractInputRequest,
  ExtractResult,
  FixToolArgs,
  FixToolResult,
  Log,
  Run,
  RunStatus,
  SuggestedTool,
  System,
  Tool,
  ToolArgs,
  ToolDiff,
  ToolInputRequest,
  ToolResult,
  ToolStepResult,
  UpsertMode,
} from "./types.js";
import {
  LogSubscriptionOptions,
  WebSocketManager,
  WebSocketSubscription,
} from "./websocket-manager.js";

export class SuperglueClient {
  private endpoint: string;
  private apiKey: string;
  private wsManager: WebSocketManager;
  public readonly apiEndpoint: string;

  private static workflowQL = `
        id
        version
        createdAt
        updatedAt
        steps {
          id
          modify
          apiConfig {
            id
            urlHost
            urlPath
            instruction
            method
            queryParams
            headers
            body
            pagination {
              type
              pageSize
              cursorPath
              stopCondition
            }
          }
          systemId
          executionMode
          loopSelector
          failureBehavior
        }
        systemIds
        responseSchema
        originalResponseSchema
        finalTransform
        inputSchema
        instruction
        folder
        archived
        responseFilters {
          id
          name
          enabled
          target
          pattern
          action
          maskValue
          scope
        }
    `;

  private static configQL = `
    config {
      ... on ApiConfig {
        id
        version
        createdAt
        updatedAt
        urlHost
        urlPath
        instruction
        method
        queryParams
        headers
        body
        pagination {
          type
          pageSize
          cursorPath
          stopCondition
        }
      }
      ... on Workflow {
        ${SuperglueClient.workflowQL}
      }
    }
    `;

  constructor({
    endpoint,
    apiKey,
    apiEndpoint,
  }: {
    endpoint?: string;
    apiKey: string;
    apiEndpoint?: string;
  }) {
    this.endpoint = endpoint ?? "https://graphql.superglue.cloud";
    this.apiKey = apiKey;
    this.apiEndpoint = apiEndpoint ?? "https://api.superglue.cloud";
    this.wsManager = new WebSocketManager(this.endpoint, this.apiKey);
  }

  protected async restRequest<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.apiEndpoint.replace(/\/$/, "")}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (body && method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${errorText}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = (errorJson as any).error || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    // Handle empty responses (e.g., 204 No Content)
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private async request<T>(query: string, variables?: Record<string, any>): Promise<T> {
    try {
      const response = await axios.post(
        this.endpoint,
        {
          query,
          variables,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );
      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }
      const json = response.data;
      return json.data as T;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  private async graphQL<T = any>(query: string, variables?: any): Promise<T> {
    const res = await fetch(`${this.endpoint.replace(/\/$/, "")}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GraphQL ${res.status}`);
    const json = await res.json();
    if (json.errors && json.errors.length)
      throw new Error(json.errors[0]?.message || "GraphQL error");
    return json.data as T;
  }

  async subscribeToLogs(options: LogSubscriptionOptions = {}): Promise<WebSocketSubscription> {
    return this.wsManager.subscribeToLogs(options);
  }

  async disconnect(): Promise<void> {
    return this.wsManager.disconnect();
  }

  async executeWorkflow<T = any>({
    id,
    tool,
    payload,
    credentials,
    options,
    verbose = true,
    runId,
    traceId,
  }: ToolArgs): Promise<ToolResult & { data?: T }> {
    const mutation = `
        mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON, $credentials: JSON, $options: RequestOptions, $runId: ID, $traceId: ID) {
          executeWorkflow(input: $input, payload: $payload, credentials: $credentials, options: $options, runId: $runId, traceId: $traceId) {
            id
            success
            data
            config {${SuperglueClient.workflowQL}}
            stepResults {
              stepId
              success
              rawData
              transformedData
              error
            }
            error
            startedAt
            completedAt
          }
        }
      `;

    let gqlInput: Partial<ToolInputRequest> = {};

  /**
   * Execute a tool config without saving (no run record)
   * Used for SDK/playground testing
   */
  async runToolConfig(params: {
    tool: Tool;
    payload?: Record<string, any>;
    credentials?: Record<string, string>;
    options?: { timeout?: number };
    runId?: string;
    traceId?: string;
  }): Promise<ToolResult> {
    const response = await this.restRequest<{
      runId: string;
      success: boolean;
      data?: any;
      error?: string;
      stepResults?: Array<{ stepId: string; success: boolean; data?: any; error?: string }>;
      tool: Tool;
    }>(
      "POST",
      "/v1/tools/run",
      {
        tool: params.tool,
        payload: params.payload,
        credentials: params.credentials,
        options: params.options,
        runId: params.runId,
      },
      params.traceId ? { "X-Trace-Id": params.traceId } : undefined,
    );

          const executionStepInput = {
            id: step.id,
            modify: step.modify,
            apiConfig: apiConfigInput,
            systemId: step.systemId,
            executionMode: step.executionMode,
            loopSelector: step.loopSelector,
            failureBehavior: step.failureBehavior,
          };
          Object.keys(executionStepInput).forEach(
            (key) =>
              (executionStepInput as any)[key] === undefined &&
              delete (executionStepInput as any)[key],
          );
          return executionStepInput;
        }),
        systemIds: tool.systemIds,
        finalTransform: tool.finalTransform,
        inputSchema: tool.inputSchema,
        responseSchema: tool.responseSchema,
        instruction: tool.instruction,
        responseFilters: tool.responseFilters,
      };
      Object.keys(toolInput).forEach(
        (key) => (toolInput as any)[key] === undefined && delete (toolInput as any)[key],
      );
      gqlInput = { workflow: toolInput };
    } else {
      throw new Error("Either id or tool must be provided for executeWorkflow.");
    }

    let logSubscription: WebSocketSubscription | undefined;
    if (verbose) {
      try {
        logSubscription = await this.subscribeToLogs({
          onLog: (log: Log) => {
            const timestamp = log.timestamp.toLocaleTimeString();
            const levelColor =
              log.level === "ERROR"
                ? "\x1b[31m"
                : log.level === "WARN"
                  ? "\x1b[33m"
                  : log.level === "DEBUG"
                    ? "\x1b[36m"
                    : "\x1b[0m";
            console.log(`${levelColor}[${timestamp}] ${log.level}\x1b[0m: ${log.message}`);
          },
          onError: (error: Error) => {
            console.error("Log subscription error:", error);
          },
          includeDebug: true,
        });
      } catch (error) {
        console.error("Log subscription error:", error);
      }
    }

    try {
      type GraphQLWorkflowResult = Omit<ToolResult, "stepResults"> & {
        data?: any;
        stepResults: (ToolStepResult & { rawData: any; transformedData: any })[];
      };
      const result = await this.request<{ executeWorkflow: GraphQLWorkflowResult }>(mutation, {
        input: gqlInput,
        payload,
        credentials,
        options,
        runId,
        traceId,
      }).then((data) => data.executeWorkflow);

      if (result.error) {
        throw new Error(result.error);
      }

      result.stepResults.forEach((stepResult) => {
        stepResult.data = stepResult.transformedData;
      });

      return result as ToolResult & { data?: T };
    } finally {
      if (logSubscription) {
        setTimeout(() => {
          logSubscription.unsubscribe();
        }, 1000);
      }
    }
  }

  async abortToolExecution(runId: string): Promise<{ success: boolean; runId: string }> {
    const mutation = `
        mutation AbortToolExecution($runId: ID!) {
          abortToolExecution(runId: $runId) {
            success
            runId
          }
        }
      `;
    const response = await this.request<{
      abortToolExecution: { success: boolean; runId: string };
    }>(mutation, { runId });
    return response.abortToolExecution;
  }

  /**
   * Execute a single step without creating a run in the database.
   * Used for individual step testing in the playground.
   */
  async executeStep({
    step,
    payload,
    previousResults,
    credentials,
    options,
    runId,
  }: {
    step: any;
    payload?: Record<string, any>;
    previousResults?: Record<string, any>;
    credentials?: Record<string, string>;
    options?: { timeout?: number };
    runId?: string;
  }): Promise<{
    stepId: string;
    success: boolean;
    data?: any;
    error?: string;
    updatedStep?: any;
  }> {
    return this.restRequest("POST", "/v1/tools/step/run", {
      step,
      payload,
      previousResults,
      credentials,
      options,
      runId,
    });
  }

  /**
   * Abort an in-flight step execution by runId.
   */
  async abortStep(runId: string): Promise<{ success: boolean; runId: string }> {
    return this.restRequest("POST", "/v1/tools/step/abort", { runId });
  }

  /**
   * Execute a final transform without creating a run in the database.
   * Used for transform testing in the playground.
   */
  async executeTransformOnly({
    finalTransform,
    responseSchema,
    inputSchema,
    payload,
    stepResults,
    responseFilters,
    options,
    runId,
  }: {
    finalTransform: string;
    responseSchema?: any;
    inputSchema?: any;
    payload?: Record<string, any>;
    stepResults?: Record<string, any>;
    responseFilters?: any[];
    options?: { timeout?: number };
    runId?: string;
  }): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    updatedTransform?: string;
    updatedResponseSchema?: any;
  }> {
    return this.restRequest("POST", "/v1/tools/transform/run", {
      finalTransform,
      responseSchema,
      inputSchema,
      payload,
      stepResults,
      responseFilters,
      options,
      runId,
    });
  }

  /**
   * Create a run entry in the database after manual tool execution.
   * Used when "Run All Steps" completes in the playground.
   */
  async createRun({
    toolId,
    toolConfig,
    status,
    error,
    startedAt,
    completedAt,
  }: {
    toolId: string;
    toolConfig: Tool;
    status: "success" | "failed" | "aborted";
    error?: string;
    startedAt: Date;
    completedAt: Date;
  }): Promise<{
    runId: string;
    toolId: string;
    status: string;
  }> {
    return this.restRequest("POST", "/v1/runs", {
      toolId,
      toolConfig,
      status,
      error,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
  }

  async buildWorkflow({
    instruction,
    payload,
    systemIds,
    responseSchema,
    save = true,
    verbose = true,
    traceId,
  }: BuildToolArgs): Promise<Tool> {
    const mutation = `
        mutation BuildWorkflow($instruction: String!, $payload: JSON, $systemIds: [ID!], $responseSchema: JSONSchema, $traceId: ID) {
          buildWorkflow(instruction: $instruction, payload: $payload, systemIds: $systemIds, responseSchema: $responseSchema, traceId: $traceId) {${SuperglueClient.workflowQL}}
        }
      `;

    let logSubscription: WebSocketSubscription | undefined;
    if (verbose) {
      try {
        logSubscription = await this.subscribeToLogs({
          onLog: (log: Log) => {
            const timestamp = log.timestamp.toLocaleTimeString();
            const levelColor =
              log.level === "ERROR"
                ? "\x1b[31m"
                : log.level === "WARN"
                  ? "\x1b[33m"
                  : log.level === "DEBUG"
                    ? "\x1b[36m"
                    : "\x1b[0m";
            console.log(`${levelColor}[${timestamp}] ${log.level}\x1b[0m: ${log.message}`);
          },
          onError: (error: Error) => {
            console.error("Log subscription error:", error);
          },
          includeDebug: true,
        });
      } catch (error) {
        console.error("Log subscription error:", error);
      }
    }

    try {
      const workflow = await this.request<{ buildWorkflow: Tool }>(mutation, {
        instruction,
        payload,
        systemIds,
        responseSchema: responseSchema ?? {},
        traceId,
      }).then((data) => data.buildWorkflow);

      if (save) {
        await this.upsertWorkflow(workflow.id, workflow);
      }

      return workflow;
    } finally {
      if (logSubscription) {
        setTimeout(() => {
          logSubscription.unsubscribe();
        }, 2000);
      }
    }
  }

  async fixWorkflow({
    tool,
    fixInstructions,
    lastError,
    stepResults,
    traceId,
    verbose = true,
  }: FixToolArgs & { verbose?: boolean }): Promise<FixToolResult> {
    const mutation = `
        mutation FixWorkflow($workflow: WorkflowInput!, $fixInstructions: String!, $lastError: String, $systemIds: [ID!]) {
          fixWorkflow(workflow: $workflow, fixInstructions: $fixInstructions, lastError: $lastError, systemIds: $systemIds) {
            workflow {${SuperglueClient.workflowQL}}
            diffs {
              op
              path
              value
              from
            }
          }
        }
      `;

    let logSubscription: WebSocketSubscription | undefined;
    if (verbose) {
      try {
        logSubscription = await this.subscribeToLogs({
          onLog: (log: Log) => {
            const timestamp = log.timestamp.toLocaleTimeString();
            const levelColor =
              log.level === "ERROR"
                ? "\x1b[31m"
                : log.level === "WARN"
                  ? "\x1b[33m"
                  : log.level === "DEBUG"
                    ? "\x1b[36m"
                    : "\x1b[0m";
            console.log(`${levelColor}[${timestamp}] ${log.level}\x1b[0m: ${log.message}`);
          },
          onError: (error: Error) => {
            console.error("Log subscription error:", error);
          },
          includeDebug: true,
        });
      } catch (error) {
        console.error("Log subscription error:", error);
      }
    }

    try {
      const response = await this.restRequest<{
        success: boolean;
        tool?: Tool;
        diffs?: ToolDiff[];
        error?: string;
      }>(
        "POST",
        "/v1/tools/fix",
        {
          tool,
          fixInstructions,
          lastError,
          stepResults,
        },
        traceId ? { "X-Trace-Id": traceId } : undefined,
      );

        const executionStepInput = {
          id: step.id,
          modify: step.modify,
          apiConfig: apiConfigInput,
          systemId: step.systemId,
          executionMode: step.executionMode,
          loopSelector: step.loopSelector,
          failureBehavior: step.failureBehavior,
        };
        Object.keys(executionStepInput).forEach(
          (key) =>
            (executionStepInput as any)[key] === undefined &&
            delete (executionStepInput as any)[key],
        );
        return executionStepInput;
      }),
      systemIds: tool.systemIds,
      finalTransform: tool.finalTransform,
      inputSchema: tool.inputSchema,
      responseSchema: tool.responseSchema,
      instruction: tool.instruction,
      responseFilters: tool.responseFilters,
    };
    Object.keys(toolInput).forEach(
      (key) => (toolInput as any)[key] === undefined && delete (toolInput as any)[key],
    );

    try {
      const result = await this.request<{ fixWorkflow: { workflow: Tool; diffs: ToolDiff[] } }>(
        mutation,
        {
          workflow: toolInput,
          fixInstructions,
          lastError,
          systemIds,
        },
      ).then((data) => data.fixWorkflow);

      return {
        tool: result.workflow,
        diffs: result.diffs,
      };
    } finally {
      if (logSubscription) {
        setTimeout(() => {
          logSubscription.unsubscribe();
        }, 2000);
      }
    }
  }

  async extract<T = any>({
    id,
    endpoint,
    file,
    payload,
    credentials,
    options,
  }: ExtractArgs): Promise<ExtractResult & { data: T }> {
    const mutation = `
        mutation Extract($input: ExtractInputRequest!, $payload: JSON, $credentials: JSON, $options: RequestOptions) {
          extract(input: $input, payload: $payload, credentials: $credentials, options: $options) {
            id
            success
            data
            error
            startedAt
            completedAt
            ${SuperglueClient.configQL}
          }
        }
      `;

    if (file) {
      const operations = {
        query: mutation,
        variables: {
          input: { file: null },
          payload,
          credentials,
          options,
        },
      };

      const formData = new FormData();
      formData.append("operations", JSON.stringify(operations));
      formData.append("map", JSON.stringify({ "0": ["variables.input.file"] }));
      formData.append("0", file);

      const response = await axios.post(this.endpoint, formData, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      return response.data.data.extract;
    }

    let gqlInput: Partial<ExtractInputRequest> = {};
    if (id) {
      gqlInput = { id };
    } else if (endpoint) {
      const extractInput = {
        id: endpoint.id,
        urlHost: endpoint.urlHost,
        instruction: endpoint.instruction,
        urlPath: endpoint.urlPath,
        queryParams: endpoint.queryParams,
        method: endpoint.method,
        headers: endpoint.headers,
        body: endpoint.body,
        documentationUrl: endpoint.documentationUrl,
        decompressionMethod: endpoint.decompressionMethod,
        fileType: endpoint.fileType,
        authentication: endpoint.authentication,
        dataPath: endpoint.dataPath,
        version: endpoint.version,
      };
      Object.keys(extractInput).forEach(
        (key) => (extractInput as any)[key] === undefined && delete (extractInput as any)[key],
      );
      gqlInput = { endpoint: extractInput };
    } else {
      throw new Error("Either id, endpoint, or file must be provided for extract.");
    }

    return this.request<{ extract: ExtractResult & { data: T } }>(mutation, {
      input: gqlInput,
      payload,
      credentials,
      options,
    }).then((data) => data.extract);
  }

  private mapOpenAPIRunToRun(openAPIRun: any): Run {
    const statusMap: Record<string, RunStatus> = {
      running: RunStatus.RUNNING,
      success: RunStatus.SUCCESS,
      failed: RunStatus.FAILED,
      aborted: RunStatus.ABORTED,
    };
    return {
      ...openAPIRun,
      status: statusMap[openAPIRun.status] ?? RunStatus.FAILED,
    } as Run;
  }

  async listRuns(options?: {
    limit?: number;
    page?: number;
    toolId?: string;
    status?: "running" | "success" | "failed" | "aborted";
    requestSources?: ("api" | "frontend" | "scheduler" | "mcp" | "tool-chain" | "webhook")[];
  }): Promise<{ items: Run[]; total: number; page: number; limit: number; hasMore: boolean }> {
    const { limit = 100, page = 1, toolId, status, requestSources } = options ?? {};
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });
    if (toolId) params.set("toolId", toolId);
    if (status) params.set("status", status);
    if (requestSources && requestSources.length > 0) {
      params.set("requestSources", requestSources.join(","));
    }

    const response = await this.restRequest<{
      data: any[];
      total: number;
      page: number;
      limit: number;
      hasMore: boolean;
    }>("GET", `/v1/runs?${params.toString()}`);

    return {
      items: response.data.map((run) => this.mapOpenAPIRunToRun(run)),
      total: response.total,
      page: response.page,
      limit: response.limit,
      hasMore: response.hasMore,
    };
  }

  async getRun(id: string): Promise<Run> {
    const response = await this.restRequest<any>("GET", `/v1/runs/${encodeURIComponent(id)}`);
    return this.mapOpenAPIRunToRun(response);
  }

  async getWorkflow(id: string): Promise<Tool> {
    const query = `
        query GetWorkflow($id: ID!) {
          getWorkflow(id: $id) {${SuperglueClient.workflowQL}}
        }
      `;
    const response = await this.request<{ getWorkflow: Tool }>(query, { id });
    return response.getWorkflow;
  }

  async archiveWorkflow(id: string, archived: boolean = true): Promise<Tool> {
    return this.upsertWorkflow(id, { archived });
  }

  async listWorkflows(
    limit: number = 10,
    offset: number = 0,
  ): Promise<{ items: Tool[]; total: number }> {
    const query = `
        query ListWorkflows($limit: Int!, $offset: Int!) {
          listWorkflows(limit: $limit, offset: $offset) {
            items {${SuperglueClient.workflowQL}}
            total
          }
        }
      `;
    const response = await this.request<{ listWorkflows: { items: Tool[]; total: number } }>(
      query,
      { limit, offset },
    );
    return response.listWorkflows;
  }

  async upsertWorkflow(id: string, input: Partial<Tool>): Promise<Tool> {
    const mutation = `
        mutation UpsertWorkflow($id: ID!, $input: JSON!) {
          upsertWorkflow(id: $id, input: $input) {${SuperglueClient.workflowQL}}
        }
      `;

    return this.request<{ upsertWorkflow: Tool }>(mutation, { id, input }).then(
      (data) => data.upsertWorkflow,
    );
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const mutation = `
      mutation DeleteWorkflow($id: ID!) {
        deleteWorkflow(id: $id)
      }
    `;
    return this.request<{ deleteWorkflow: boolean }>(mutation, { id }).then(
      (data) => data.deleteWorkflow,
    );
  }

  async renameWorkflow(oldId: string, newId: string): Promise<Tool> {
    const mutation = `
      mutation RenameWorkflow($oldId: ID!, $newId: ID!) {
        renameWorkflow(oldId: $oldId, newId: $newId) {${SuperglueClient.workflowQL}}
      }
    `;
    return this.request<{ renameWorkflow: Tool }>(mutation, { oldId, newId }).then(
      (data) => data.renameWorkflow,
    );
  }

  async listSystems(
    limit: number = 10,
    page: number = 1,
    options?: { includeDocs?: boolean },
  ): Promise<{ items: System[]; total: number }> {
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });
    if (options?.includeDocs) {
      params.set("includeDocs", "true");
    }
    const response = await this.restRequest<{
      success: boolean;
      data: System[];
      total: number;
      page: number;
      limit: number;
    }>("GET", `/v1/systems?${params.toString()}`);
    return { items: response.data, total: response.total };
  }

  async findRelevantTools(searchTerms?: string): Promise<SuggestedTool[]> {
    const query = `
        query FindRelevantTools($searchTerms: String) {
          findRelevantTools(searchTerms: $searchTerms) {
            id
            instruction
            inputSchema
            responseSchema
            steps {
              systemId
              instruction
            }
            reason
          }
        }
      `;
    const response = await this.request<{ findRelevantTools: SuggestedTool[] }>(query, {
      searchTerms,
    });
    return response.findRelevantTools;
  }

  async getSystem(id: string, options?: { includeDocs?: boolean }): Promise<System> {
    const params = options?.includeDocs ? "?includeDocs=true" : "";
    const response = await this.restRequest<{ success: boolean; data: System }>(
      "GET",
      `/v1/systems/${encodeURIComponent(id)}${params}`,
    );
    return response.data;
  }

  async upsertSystem(
    id: string,
    input: Partial<System>,
    mode: UpsertMode = UpsertMode.UPSERT,
    credentialMode?: CredentialMode,
  ): Promise<System> {
    const mutation = `
        mutation UpsertSystem($input: SystemInput!, $mode: UpsertMode, $credentialMode: CredentialMode) {
          upsertSystem(input: $input, mode: $mode, credentialMode: $credentialMode) {
            id
            name
            type
            urlHost
            urlPath
            credentials
            documentationUrl
            documentation
            documentationPending
            openApiSchema
            openApiUrl
            specificInstructions
            documentationKeywords
            icon
            metadata
            templateName
            version
            createdAt
            updatedAt
          }
        }
      `;
    const systemInput = { id, ...input };
    const response = await this.request<{ upsertSystem: System }>(mutation, {
      input: systemInput,
      mode,
      credentialMode,
    });
    return response.upsertSystem;
  }

  async deleteSystem(id: string): Promise<boolean> {
    const mutation = `
        mutation DeleteSystem($id: ID!) {
          deleteSystem(id: $id)
        }
      `;
    const response = await this.request<{ deleteSystem: boolean }>(mutation, { id });
    return response.deleteSystem;
  }

  async cacheOauthClientCredentials(args: {
    clientCredentialsUid: string;
    clientId: string;
    clientSecret: string;
  }): Promise<boolean> {
    const data = await this.graphQL<{ cacheOauthClientCredentials: boolean }>(
      `
            mutation CacheOauthClientCredentials($clientCredentialsUid: String!, $clientId: String!, $clientSecret: String!) {
                cacheOauthClientCredentials(clientCredentialsUid: $clientCredentialsUid, clientId: $clientId, clientSecret: $clientSecret)
            }
        `,
      args,
    );
    return Boolean(data?.cacheOauthClientCredentials);
  }

  async getOAuthClientCredentials(args: {
    templateId?: string;
    clientCredentialsUid?: string;
  }): Promise<{ client_id: string; client_secret: string }> {
    const data = await this.graphQL<{
      getOAuthClientCredentials: { client_id: string; client_secret: string };
    }>(
      `
            mutation GetOAuthClientCredentials($templateId: ID, $clientCredentialsUid: String) {
                getOAuthClientCredentials(templateId: $templateId, clientCredentialsUid: $clientCredentialsUid) {
                    client_id
                    client_secret
                }
            }
        `,
      args,
    );
    return data.getOAuthClientCredentials;
  }

  async searchSystemDocumentation(systemId: string, keywords: string): Promise<string> {
    const data = await this.graphQL<{ searchSystemDocumentation: string }>(
      `
            query SearchSystemDocumentation($systemId: ID!, $keywords: String!) {
                searchSystemDocumentation(systemId: $systemId, keywords: $keywords)
            }
        `,
      { systemId, keywords },
    );
    return data.searchSystemDocumentation;
  }

  async generateInstructions(systems: any[]): Promise<string[]> {
    const data = await this.graphQL<{ generateInstructions: string[] }>(
      `
            query GenerateInstructions($systems: [SystemInput!]!) {
                generateInstructions(systems: $systems)
            }
        `,
      { systems },
    );

    const instructions = data.generateInstructions;
    if (instructions.length === 1 && instructions[0].startsWith("Error:")) {
      throw new Error(instructions[0].replace("Error: ", ""));
    }
    return instructions;
  }
}
