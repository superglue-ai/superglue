import {
  ExtractArgs,
  ExtractResult,
  FileReference,
  Log,
  Run,
  RunStatus,
  SuggestedTool,
  System,
  Tool,
  ToolDiff,
  ToolResult,
} from "./types.js";
import {
  SSELogSubscriptionManager,
  SSELogSubscriptionOptions,
  SSESubscription,
} from "./sse-log-subscription.js";

export class SuperglueClient {
  private apiKey: string;
  private sseManager: SSELogSubscriptionManager;
  public readonly apiEndpoint: string;

  constructor({
    endpoint,
    apiKey,
    apiEndpoint,
  }: {
    endpoint?: string;
    apiKey: string;
    apiEndpoint?: string;
  }) {
    this.apiKey = apiKey;
    this.apiEndpoint = apiEndpoint ?? endpoint ?? "https://api.superglue.cloud";
    this.sseManager = new SSELogSubscriptionManager(this.apiEndpoint, this.apiKey);
  }

  protected async restRequest<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: any,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.apiEndpoint.replace(/\/$/, "")}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...extraHeaders,
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
        const error = (errorJson as any).error;
        if (typeof error === "string") {
          errorMessage = error;
        } else if (error && typeof error === "object") {
          errorMessage = error.message || JSON.stringify(error);
        }
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

  async subscribeToLogsSSE(options: SSELogSubscriptionOptions = {}): Promise<SSESubscription> {
    return this.sseManager.subscribeToLogs(options);
  }

  async disconnect(): Promise<void> {
    await this.sseManager.disconnect();
  }

  /**
   * Execute a saved tool by ID (creates run record)
   */
  async runTool(params: {
    toolId: string;
    payload?: Record<string, any>;
    credentials?: Record<string, string>;
    options?: {
      timeout?: number;
      traceId?: string;
      webhookUrl?: string;
      async?: boolean;
      requestSource?: "frontend" | "mcp";
    };
    runId?: string;
  }): Promise<ToolResult> {
    const response = await this.restRequest<{
      runId: string;
      toolId: string;
      status: "running" | "success" | "failed" | "aborted";
      tool: Tool;
      toolPayload?: Record<string, any>;
      data?: any;
      error?: string;
      stepResults?: Array<{ stepId: string; success: boolean; data?: any; error?: string }>;
    }>("POST", `/v1/tools/${encodeURIComponent(params.toolId)}/run`, {
      inputs: params.payload,
      credentials: params.credentials,
      options: params.options,
      runId: params.runId,
    });

    return {
      success: response.status === "success",
      data: response.data,
      error: response.error,
      tool: response.tool,
      stepResults: response.stepResults?.map((sr) => ({
        stepId: sr.stepId,
        success: sr.success,
        data: sr.data,
        error: sr.error,
      })),
    };
  }

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

    return {
      success: response.success,
      data: response.data,
      error: response.error,
      tool: response.tool,
      stepResults: response.stepResults?.map((sr) => ({
        stepId: sr.stepId,
        success: sr.success,
        data: sr.data,
        error: sr.error,
      })),
    };
  }

  async abortToolExecution(runId: string): Promise<{ success: boolean; runId: string }> {
    const response = await this.restRequest<any>(
      "POST",
      `/v1/runs/${encodeURIComponent(runId)}/cancel`,
    );
    return { success: true, runId: response.runId };
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
    outputTransform,
    outputSchema,
    inputSchema,
    payload,
    stepResults,
    responseFilters,
    options,
    runId,
  }: {
    outputTransform: string;
    outputSchema?: any;
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
    updatedOutputSchema?: any;
  }> {
    return this.restRequest("POST", "/v1/tools/transform/run", {
      outputTransform,
      outputSchema,
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
    toolResult,
    stepResults,
    toolPayload,
    status,
    error,
    startedAt,
    completedAt,
  }: {
    toolId: string;
    toolConfig: Tool;
    toolResult?: unknown;
    stepResults?: Array<{ stepId: string; success: boolean; data?: unknown; error?: string }>;
    toolPayload?: Record<string, unknown>;
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
      toolResult,
      stepResults,
      toolPayload,
      status,
      error,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
  }

  async extract<T = any>({ file }: ExtractArgs): Promise<ExtractResult & { data: T }> {
    if (!file) {
      throw new Error("File must be provided for extract.");
    }

    const formData = new FormData();
    formData.append("file", file);

    const url = `${this.apiEndpoint.replace(/\/$/, "")}/v1/extract`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${errorText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) errorMessage = errorJson.error;
      } catch {}
      throw new Error(errorMessage);
    }

    return response.json();
  }

  private mapOpenAPIRunToRun(openAPIRun: any): Run {
    const statusMap: Record<string, RunStatus> = {
      running: RunStatus.RUNNING,
      success: RunStatus.SUCCESS,
      failed: RunStatus.FAILED,
      aborted: RunStatus.ABORTED,
    };
    return {
      runId: openAPIRun.runId ?? openAPIRun.id,
      toolId: openAPIRun.toolId,
      tool: openAPIRun.tool,
      status: statusMap[openAPIRun.status] ?? RunStatus.FAILED,
      toolPayload: openAPIRun.toolPayload,
      data: openAPIRun.data,
      toolResult: openAPIRun.data,
      error: openAPIRun.error,
      stepResults: openAPIRun.stepResults,
      options: openAPIRun.options,
      requestSource: openAPIRun.requestSource,
      traceId: openAPIRun.traceId,
      resultStorageUri: openAPIRun.resultStorageUri,
      userId: openAPIRun.userId,
      userEmail: openAPIRun.userEmail,
      userName: openAPIRun.userName,
      metadata: openAPIRun.metadata,
    } as Run;
  }

  async listRuns(options?: {
    limit?: number;
    page?: number;
    toolId?: string;
    status?: "running" | "success" | "failed" | "aborted";
    requestSources?: ("api" | "frontend" | "scheduler" | "mcp" | "tool-chain" | "webhook")[];
    userId?: string;
    systemId?: string;
  }): Promise<{ items: Run[]; total: number; page: number; limit: number; hasMore: boolean }> {
    const {
      limit = 100,
      page = 1,
      toolId,
      status,
      requestSources,
      userId,
      systemId,
    } = options ?? {};
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });
    if (toolId) params.set("toolId", toolId);
    if (status) params.set("status", status);
    if (requestSources && requestSources.length > 0) {
      params.set("requestSources", requestSources.join(","));
    }
    if (userId) params.set("userId", userId);
    if (systemId) params.set("systemId", systemId);

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

  async getRun(id: string): Promise<Run | null> {
    try {
      const response = await this.restRequest<any>("GET", `/v1/runs/${encodeURIComponent(id)}`);
      return this.mapOpenAPIRunToRun(response);
    } catch (err: any) {
      if (err.message?.includes("404") || err.message?.includes("not found")) {
        return null;
      }
      throw err;
    }
  }

  async getWorkflow(id: string): Promise<Tool | null> {
    try {
      return await this.restRequest<Tool>("GET", `/v1/tools/${encodeURIComponent(id)}`);
    } catch (err: any) {
      if (err.message?.includes("404") || err.message?.includes("not found")) {
        return null;
      }
      throw err;
    }
  }

  async archiveWorkflow(id: string, archived: boolean = true): Promise<Tool> {
    return this.upsertWorkflow(id, { archived });
  }

  async listWorkflows(
    limit: number = 10,
    offset: number = 0,
  ): Promise<{ items: Tool[]; total: number }> {
    // Convert offset to page number (1-indexed)
    const page = Math.floor(offset / limit) + 1;
    const response = await this.restRequest<{
      data: Tool[];
      total: number;
      page: number;
      limit: number;
      hasMore: boolean;
    }>("GET", `/v1/tools?limit=${limit}&page=${page}`);
    return { items: response.data, total: response.total };
  }

  async upsertWorkflow(id: string, input: Partial<Tool>): Promise<Tool> {
    // Check if tool exists to determine create vs update
    const existing = await this.getWorkflow(id);
    if (existing) {
      // Update existing tool
      return this.restRequest<Tool>("PUT", `/v1/tools/${encodeURIComponent(id)}`, input);
    } else {
      // Create new tool
      return this.restRequest<Tool>("POST", "/v1/tools", { id, ...input });
    }
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    try {
      await this.restRequest<{ success: boolean }>("DELETE", `/v1/tools/${encodeURIComponent(id)}`);
      return true;
    } catch (err: any) {
      if (err.message?.includes("404")) {
        return false;
      }
      throw err;
    }
  }

  async renameWorkflow(oldId: string, newId: string): Promise<Tool> {
    return this.restRequest<Tool>("POST", `/v1/tools/${encodeURIComponent(oldId)}/rename`, {
      newId,
    });
  }

  async listSystems(
    limit: number = 10,
    page: number = 1,
  ): Promise<{ items: System[]; total: number }> {
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });
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
    const params = searchTerms ? `?q=${encodeURIComponent(searchTerms)}` : "";
    const response = await this.restRequest<{ data: SuggestedTool[] }>(
      "GET",
      `/v1/tools/search${params}`,
    );
    return response.data;
  }

  async getSystem(id: string): Promise<System> {
    const response = await this.restRequest<{ success: boolean; data: System }>(
      "GET",
      `/v1/systems/${encodeURIComponent(id)}`,
    );
    return response.data;
  }

  async createSystem(input: {
    id?: string;
    name: string;
    url: string;
    credentials?: Record<string, any>;
    specificInstructions?: string;
    icon?: string;
    templateName?: string;
    documentationFiles?: Record<string, string[]>;
    metadata?: Record<string, any>;
    multiTenancyMode?: string;
    tunnel?: { tunnelId: string; targetName: string };
  }): Promise<System> {
    const response = await this.restRequest<{ success: boolean; data: System }>(
      "POST",
      "/v1/systems",
      input,
    );
    return response.data;
  }

  async updateSystem(id: string, input: Partial<System>): Promise<System> {
    const response = await this.restRequest<{ success: boolean; data: System }>(
      "PATCH",
      `/v1/systems/${encodeURIComponent(id)}`,
      input,
    );
    return response.data;
  }

  async deleteSystem(id: string): Promise<boolean> {
    await this.restRequest<{ success: boolean }>("DELETE", `/v1/systems/${encodeURIComponent(id)}`);
    return true;
  }

  async cacheOAuthSecret(args: {
    uid: string;
    clientId: string;
    clientSecret: string;
  }): Promise<boolean> {
    await this.restRequest<{ success: boolean }>("POST", "/v1/oauth/secrets", args);
    return true;
  }

  async getOAuthSecret(uid: string): Promise<{ client_id: string; client_secret: string }> {
    const response = await this.restRequest<{
      success: boolean;
      data: { client_id: string; client_secret: string };
    }>("GET", `/v1/oauth/secrets/${encodeURIComponent(uid)}`);
    return response.data;
  }

  async getTemplateOAuthCredentials(
    templateId: string,
  ): Promise<{ client_id: string; client_secret: string }> {
    const response = await this.restRequest<{
      success: boolean;
      data: { client_id: string; client_secret: string };
    }>("GET", `/v1/oauth/templates/${encodeURIComponent(templateId)}/credentials`);
    return response.data;
  }

  async searchSystemDocumentation(systemId: string, keywords: string): Promise<string> {
    const response = await this.restRequest<{ success: boolean; data: string }>(
      "POST",
      `/v1/systems/${encodeURIComponent(systemId)}/documentation/search`,
      { keywords },
    );
    return response.data;
  }

  async cacheOauthClientCredentials(params: {
    clientCredentialsUid: string;
    clientId: string;
    clientSecret: string;
  }): Promise<{ success: boolean }> {
    return this.restRequest<{ success: boolean }>("POST", "/v1/oauth/secrets", {
      uid: params.clientCredentialsUid,
      clientId: params.clientId,
      clientSecret: params.clientSecret,
    });
  }

  async getOAuthClientCredentials(params: {
    templateId?: string;
    clientCredentialsUid?: string;
  }): Promise<{ client_id: string; client_secret: string }> {
    if (params.clientCredentialsUid) {
      const response = await this.restRequest<{
        success: boolean;
        data: { client_id: string; client_secret: string };
      }>("GET", `/v1/oauth/secrets/${encodeURIComponent(params.clientCredentialsUid)}`);
      return response.data;
    }
    if (!params.templateId) {
      throw new Error("No valid credentials source provided");
    }
    const response = await this.restRequest<{
      success: boolean;
      data: { client_id: string; client_secret: string };
    }>("GET", `/v1/oauth/templates/${encodeURIComponent(params.templateId)}/credentials`);
    return response.data;
  }

  async triggerSystemDocumentationScrapeJob(
    systemId: string,
    options?: { url?: string; keywords?: string[] },
  ): Promise<{ fileReferenceId: string; status: string }> {
    const response = await this.restRequest<{
      success: boolean;
      data: { fileReferenceId: string; status: string };
    }>("POST", `/v1/systems/${encodeURIComponent(systemId)}/documentation/scrape`, options);
    return response.data;
  }

  async fetchOpenApiSpec(
    systemId: string,
    url: string,
  ): Promise<{ fileReferenceId: string; title?: string; version?: string }> {
    const response = await this.restRequest<{
      success: boolean;
      data: { fileReferenceId: string; title?: string; version?: string };
    }>("POST", `/v1/systems/${encodeURIComponent(systemId)}/documentation/openapi`, { url });
    return response.data;
  }

  async createSystemFileUploadUrls(
    systemId: string,
    files: Array<{ fileName: string; contentType?: string; contentLength?: number }>,
  ): Promise<
    Array<{ id: string; originalFileName: string; uploadUrl: string; expiresIn: number }>
  > {
    const response = await this.restRequest<{
      success: boolean;
      data: {
        files: Array<{
          id: string;
          originalFileName: string;
          uploadUrl: string;
          expiresIn: number;
        }>;
      };
    }>("POST", `/v1/systems/${encodeURIComponent(systemId)}/file-references`, {
      files: files.map((f) => ({
        fileName: f.fileName,
        metadata: { contentType: f.contentType, contentLength: f.contentLength },
      })),
    });
    return response.data.files;
  }

  async uploadSystemFileReferences(
    systemId: string,
    files: Array<{ fileName: string; content: string; contentType?: string }>,
  ): Promise<Array<{ id: string; fileName: string }>> {
    const uploadUrls = await this.createSystemFileUploadUrls(
      systemId,
      files.map((f) => ({ fileName: f.fileName, contentType: f.contentType })),
    );
    await Promise.all(
      uploadUrls.map(async (fileInfo, i) => {
        const uploadResponse = await fetch(fileInfo.uploadUrl, {
          method: "PUT",
          body: files[i].content,
          headers: files[i].contentType ? { "Content-Type": files[i].contentType } : undefined,
        });
        if (!uploadResponse.ok) {
          throw new Error(
            `Upload failed for ${files[i].fileName}: ${uploadResponse.status} ${uploadResponse.statusText}`,
          );
        }
      }),
    );
    return uploadUrls.map((f, i) => ({ id: f.id, fileName: files[i].fileName }));
  }

  async listSystemFileReferences(systemId: string): Promise<{
    files: Array<{
      id: string;
      source: "upload" | "scrape" | "openapi";
      status: string;
      fileName: string;
      sourceUrl?: string;
      error?: string;
      createdAt?: string;
      contentLength?: number;
    }>;
  }> {
    const response = await this.restRequest<{
      success: boolean;
      data: {
        files: Array<{
          id: string;
          source: "upload" | "scrape" | "openapi";
          status: string;
          fileName: string;
          sourceUrl?: string;
          error?: string;
          createdAt?: string;
          contentLength?: number;
        }>;
      };
    }>("GET", `/v1/systems/${encodeURIComponent(systemId)}/file-references`);
    return response.data;
  }

  async deleteSystemFileReference(systemId: string, fileId: string): Promise<void> {
    await this.restRequest(
      "DELETE",
      `/v1/systems/${encodeURIComponent(systemId)}/file-references/${encodeURIComponent(fileId)}`,
    );
  }

  async getFileReferenceContent(fileId: string): Promise<string | null> {
    const response = await this.restRequest<{
      success: boolean;
      data: FileReference & { content?: string };
    }>("GET", `/v1/file-references/${encodeURIComponent(fileId)}?includeContent=true`);
    return response.data.content ?? null;
  }

  /**
   * Generate a portal link for end-user authentication.
   * Returns a URL that can be shared with end users to authenticate with systems.
   */
  async getTenantInfo(): Promise<{ email: string | null; emailEntrySkipped: boolean }> {
    return this.restRequest("GET", "/v1/tenant-info");
  }

  async setTenantInfo(input: {
    email?: string;
    emailEntrySkipped?: boolean;
  }): Promise<{ email: string | null; emailEntrySkipped: boolean }> {
    return this.restRequest("PUT", "/v1/tenant-info", input);
  }

  async generatePortalLink(): Promise<{ success: boolean; portalUrl?: string; error?: string }> {
    try {
      const result = await this.restRequest<{
        success: boolean;
        data: { portalUrl: string; token: string; expiresAt: string };
      }>("POST", "/v1/authenticate", {});
      return {
        success: true,
        portalUrl: result.data.portalUrl,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
