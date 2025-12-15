import axios from "axios";
import {
  ApiCallArgs,
  ApiConfig,
  ApiInputRequest,
  ApiResult,
  BuildToolArgs,
  CallEndpointArgs,
  CallEndpointResult,
  ExtractArgs,
  ExtractInputRequest,
  ExtractResult,
  GenerateStepConfigArgs,
  Integration,
  Log,
  Run,
  SuggestedTool,
  Tool,
  ToolArgs,
  ToolInputRequest,
  ToolResult,
  ToolSchedule,
  ToolScheduleInput,
  ToolStepResult,
  UpsertMode
} from "./types.js";
import { LogSubscriptionOptions, WebSocketManager, WebSocketSubscription } from "./websocket-manager.js";

export class SuperglueClient {
    private endpoint: string;
    private apiKey: string;
    private wsManager: WebSocketManager;
    private apiEndpoint: string;
    
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
            documentationUrl
            responseSchema
            responseMapping
            authentication
            pagination {
              type
              pageSize
              cursorPath
              stopCondition
            }
            dataPath
          }
          integrationId
          executionMode
          loopSelector
          loopMaxIters
          inputMapping
          responseMapping
          failureBehavior
        }
        integrationIds
        responseSchema
        originalResponseSchema
        finalTransform
        inputSchema
        instruction
        folder
    `;

    private static workflowScheduleQL = `
      id
      workflowId
      cronExpression
      timezone
      enabled
      payload
      options
      lastRunAt
      nextRunAt
      createdAt
      updatedAt
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
        documentationUrl
        responseSchema
        responseMapping
        authentication
        pagination {
          type
          pageSize
          cursorPath
          stopCondition
        }
        dataPath
      }
      ... on Workflow {
        ${SuperglueClient.workflowQL}
      }
    }
    `;

    constructor({endpoint, apiKey, apiEndpoint}: {endpoint?: string, apiKey: string, apiEndpoint?: string}) {
      this.endpoint = endpoint ?? 'https://graphql.superglue.cloud';
      this.apiKey = apiKey;
      this.apiEndpoint = apiEndpoint ?? 'https://api.superglue.cloud';
      this.wsManager = new WebSocketManager(this.endpoint, this.apiKey);
    }

    protected async restRequest<T>(
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      body?: any
    ): Promise<T> {
      const url = `${this.apiEndpoint.replace(/\/$/, '')}${path}`;

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
      };

      if (body && method !== 'GET') {
        headers['Content-Type'] = 'application/json';
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

      const data = await response.json();
      return data as T;
    }

    private async request<T>(query: string, variables?: Record<string, any>): Promise<T> {
        try { 
            const response = await axios.post(this.endpoint, {
                query,
                variables,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                }
            });  
            if(response.data.errors) {
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
        const res = await fetch(`${this.endpoint.replace(/\/$/, '')}/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ query, variables })
        });
        if (!res.ok) throw new Error(`GraphQL ${res.status}`);
        const json = await res.json();
        if (json.errors && json.errors.length) throw new Error(json.errors[0]?.message || 'GraphQL error');
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
      traceId
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

      if (id) {
        gqlInput = { id };
      } else if (tool) {
        const toolInput = {
          id: tool.id,
          steps: tool.steps.map(step => {
            const apiConfigInput = {
              id: step.apiConfig.id,
              urlHost: step.apiConfig.urlHost,
              instruction: step.apiConfig.instruction,
              urlPath: step.apiConfig.urlPath,
              method: step.apiConfig.method,
              queryParams: step.apiConfig.queryParams,
              headers: step.apiConfig.headers,
              body: step.apiConfig.body,
              documentationUrl: step.apiConfig.documentationUrl,
              responseSchema: step.apiConfig.responseSchema,
              responseMapping: step.apiConfig.responseMapping,
              authentication: step.apiConfig.authentication,
              pagination: step.apiConfig.pagination ? {
                type: step.apiConfig.pagination.type,
                ...(step.apiConfig.pagination.pageSize !== undefined && { pageSize: step.apiConfig.pagination.pageSize }),
                ...(step.apiConfig.pagination.cursorPath !== undefined && { cursorPath: step.apiConfig.pagination.cursorPath }),
                ...(step.apiConfig.pagination.stopCondition !== undefined && { stopCondition: step.apiConfig.pagination.stopCondition }),
              } : undefined,
              dataPath: step.apiConfig.dataPath,
              version: step.apiConfig.version,
            };
            Object.keys(apiConfigInput).forEach(key => (apiConfigInput as any)[key] === undefined && delete (apiConfigInput as any)[key]);
            
            const executionStepInput = {
              id: step.id,
              modify: step.modify,
              apiConfig: apiConfigInput,
              integrationId: step.integrationId,
              executionMode: step.executionMode,
              loopSelector: step.loopSelector,
              loopMaxIters: step.loopMaxIters,
              inputMapping: step.inputMapping,
              responseMapping: step.responseMapping,
              failureBehavior: step.failureBehavior,
            };
            Object.keys(executionStepInput).forEach(key => (executionStepInput as any)[key] === undefined && delete (executionStepInput as any)[key]);
            return executionStepInput;
          }),
          integrationIds: tool.integrationIds,
          finalTransform: tool.finalTransform,
          inputSchema: tool.inputSchema,
          responseSchema: tool.responseSchema,
          instruction: tool.instruction,
        };
        Object.keys(toolInput).forEach(key => (toolInput as any)[key] === undefined && delete (toolInput as any)[key]);
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
            const levelColor = log.level === 'ERROR' ? '\x1b[31m' : 
                              log.level === 'WARN' ? '\x1b[33m' : 
                              log.level === 'DEBUG' ? '\x1b[36m' : '\x1b[0m';
            console.log(`${levelColor}[${timestamp}] ${log.level}\x1b[0m: ${log.message}`);
          },
          onError: (error: Error) => {
            console.error('Log subscription error:', error);
          },
            includeDebug: true
          });
        } catch (error) {
          console.error('Log subscription error:', error);
        }
      }

      try {
        type GraphQLWorkflowResult = Omit<ToolResult, 'stepResults'> & { data?: any, stepResults: (ToolStepResult & { rawData: any, transformedData: any })[] };
        const result = await this.request<{ executeWorkflow: GraphQLWorkflowResult }>(mutation, {
          input: gqlInput,
          payload,
          credentials,
          options,
          runId,
          traceId
        }).then(data => data.executeWorkflow);

        if (result.error) {
          throw new Error(result.error);
        }

        result.stepResults.forEach(stepResult => {
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
      const response = await this.request<{ abortToolExecution: { success: boolean; runId: string } }>(mutation, { runId });
      return response.abortToolExecution;
    }

    async buildWorkflow({instruction, payload, integrationIds, responseSchema, save = true, verbose = true, traceId}: BuildToolArgs): Promise<Tool> {
      const mutation = `
        mutation BuildWorkflow($instruction: String!, $payload: JSON, $integrationIds: [ID!], $responseSchema: JSONSchema, $traceId: ID) {
          buildWorkflow(instruction: $instruction, payload: $payload, integrationIds: $integrationIds, responseSchema: $responseSchema, traceId: $traceId) {${SuperglueClient.workflowQL}}
        }
      `;

      let logSubscription: WebSocketSubscription | undefined;
      if (verbose) {
        try {
        logSubscription = await this.subscribeToLogs({
          onLog: (log: Log) => {
            const timestamp = log.timestamp.toLocaleTimeString();
            const levelColor = log.level === 'ERROR' ? '\x1b[31m' : 
                              log.level === 'WARN' ? '\x1b[33m' : 
                              log.level === 'DEBUG' ? '\x1b[36m' : '\x1b[0m';
            console.log(`${levelColor}[${timestamp}] ${log.level}\x1b[0m: ${log.message}`);
          },
          onError: (error: Error) => {
            console.error('Log subscription error:', error);
          },
          includeDebug: true
        });
        } catch (error) {
          console.error('Log subscription error:', error);
        }
      }

      try {
        const workflow = await this.request<{ buildWorkflow: Tool }>(mutation, {
          instruction,
          payload,
          integrationIds,
          responseSchema: responseSchema ?? {},
          traceId
        }).then(data => data.buildWorkflow);

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

    async generateStepConfig({
      integrationId,
      currentStepConfig,
      currentDataSelector,
      stepInput,
      credentials,
      errorMessage
    }: GenerateStepConfigArgs): Promise<{config: ApiConfig, dataSelector: string}> {
      const mutation = `
        mutation GenerateStepConfig(
          $integrationId: String,
          $currentStepConfig: JSON,
          $currentDataSelector: String,
          $stepInput: JSON,
          $credentials: JSON,
          $errorMessage: String
        ) {
          generateStepConfig(
            integrationId: $integrationId,
            currentStepConfig: $currentStepConfig,
            currentDataSelector: $currentDataSelector,
            stepInput: $stepInput,
            credentials: $credentials,
            errorMessage: $errorMessage
          ) {
            config {
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
              documentationUrl
              responseSchema
              responseMapping
              authentication
              pagination {
                type
                pageSize
                cursorPath
                stopCondition
              }
              dataPath
            }
            dataSelector
          }
        }
      `;
    
      const result = await this.request<{ generateStepConfig: { config: ApiConfig, dataSelector: string } }>(mutation, {
        integrationId,
        currentStepConfig,
        currentDataSelector,
        stepInput,
        credentials,
        errorMessage
      });
    
      return { config: result.generateStepConfig.config, dataSelector: result.generateStepConfig.dataSelector };
    }

    async callEndpoint(args: CallEndpointArgs): Promise<CallEndpointResult> {
      const mutation = `
        mutation CallEndpoint($integrationId: ID, $method: HttpMethod!, $url: String!, $headers: JSON, $body: String, $timeout: Int) {
          callEndpoint(integrationId: $integrationId, method: $method, url: $url, headers: $headers, body: $body, timeout: $timeout) {
            success
            status
            statusText
            headers
            body
            error
            duration
          }
        }
      `;

      const result = await this.request<{ callEndpoint: CallEndpointResult }>(mutation, args);
      return result.callEndpoint;
    }

    async call<T = unknown>({ id, endpoint, payload, credentials, options }: ApiCallArgs): Promise<ApiResult & { data: T }> {
      const mutation = `
        mutation Call($input: ApiInputRequest!, $payload: JSON, $credentials: JSON, $options: RequestOptions) {
          call(input: $input, payload: $payload, credentials: $credentials, options: $options) {
            id
            success
            data
            error
            headers
            statusCode
            startedAt
            completedAt
            ${SuperglueClient.configQL}
          }
        }
      `;
  
      let gqlInput: Partial<ApiInputRequest> = {};

      if (id) {
        gqlInput = { id };
      } else if (endpoint) {
        const apiInput = {
          id: endpoint.id,
          urlHost: endpoint.urlHost,
          instruction: endpoint.instruction,
          urlPath: endpoint.urlPath,
          method: endpoint.method,
          queryParams: endpoint.queryParams,
          headers: endpoint.headers,
          body: endpoint.body,
          documentationUrl: endpoint.documentationUrl,
          responseSchema: endpoint.responseSchema,
          responseMapping: endpoint.responseMapping,
          authentication: endpoint.authentication,
          pagination: endpoint.pagination ? {
            type: endpoint.pagination.type,
            ...(endpoint.pagination.pageSize !== undefined && { pageSize: endpoint.pagination.pageSize }),
            ...(endpoint.pagination.cursorPath !== undefined && { cursorPath: endpoint.pagination.cursorPath }),
            ...(endpoint.pagination.stopCondition !== undefined && { stopCondition: endpoint.pagination.stopCondition }),
          } : undefined,
          dataPath: endpoint.dataPath,
          version: endpoint.version,
        };
        Object.keys(apiInput).forEach(key => (apiInput as any)[key] === undefined && delete (apiInput as any)[key]);
        gqlInput = { endpoint: apiInput };
      } else {
        throw new Error("Either id or endpoint must be provided for call.");
      }

      const result = await this.request<{ call: ApiResult & { data: T } }>(mutation, {
        input: gqlInput,
        payload,
        credentials,
        options
      }).then(data => data?.call);

      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    }
  
    async extract<T = any>({
      id,
      endpoint,
      file,
      payload,
      credentials,    
      options
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
            options 
          }
        };
    
        const formData = new FormData();
        formData.append('operations', JSON.stringify(operations));
        formData.append('map', JSON.stringify({ "0": ["variables.input.file"] }));
        formData.append('0', file);

        const response = await axios.post(this.endpoint, formData, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          }
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
        Object.keys(extractInput).forEach(key => (extractInput as any)[key] === undefined && delete (extractInput as any)[key]);
        gqlInput = { endpoint: extractInput };
      } else {
        throw new Error("Either id, endpoint, or file must be provided for extract.");
      }

      return this.request<{ extract: ExtractResult & { data: T } }>(mutation, {
        input: gqlInput,
        payload,
        credentials,
        options
      }).then(data => data.extract);
    }

    async listRuns(limit: number = 100, offset: number = 0, configId?: string): Promise<{ items: Run[], total: number }> {
      const query = `
        query ListRuns($limit: Int!, $offset: Int!, $configId: ID) {
          listRuns(limit: $limit, offset: $offset, configId: $configId) {
            items {
              id
              toolId
              status
              toolResult
              stepResults {
                stepId
                success
                error
              }
              error
              startedAt
              completedAt
              toolConfig {
                ${SuperglueClient.workflowQL}
              }
            }
            total
          }
        }
      `;
      const response = await this.request<{ listRuns: { items: Run[], total: number } }>(query, { limit, offset, configId }); 
      return response.listRuns;
    }

    async getRun(id: string): Promise<Run> {
      const query = `
        query GetRun($id: ID!) {
          getRun(id: $id) {
            id
            toolId
            status
            toolResult
            toolPayload
            stepResults {
              stepId
              success
              transformedData
              error
            }
            options
            error
            startedAt
            completedAt
            toolConfig {
              ${SuperglueClient.workflowQL}
            }
          }
        }
      `;
      const response = await this.request<{ getRun: Run }>(query, { id });
      const run = response.getRun;
      
      if (run.stepResults) {
        run.stepResults.forEach((stepResult: any) => {
          stepResult.data = stepResult.transformedData;
        });
      }
      
      return run;
    }
    
    async listApis(limit: number = 10, offset: number = 0): Promise<{ items: ApiConfig[], total: number }> {
      const query = `
        query ListApis($limit: Int!, $offset: Int!) {
          listApis(limit: $limit, offset: $offset) {
            items {
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
              documentationUrl
              responseSchema
              responseMapping
              authentication
              pagination {
                type
                pageSize
                cursorPath
                stopCondition
              }
              dataPath
            }
            total
          }
        }
      `;
      const response = await this.request<{ listApis: { items: ApiConfig[], total: number } }>(query, { limit, offset });
      return response.listApis;
    }

    async getApi(id: string): Promise<ApiConfig> {
      const query = `
        query GetApi($id: ID!) {
          getApi(id: $id) {
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
            documentationUrl
            responseSchema
            responseMapping
            authentication
            pagination {
              type
              pageSize
              cursorPath
              stopCondition
            }
            dataPath
          }
        }
      `;
      const response = await this.request<{ getApi: ApiConfig }>(query, { id });
      return response.getApi;
    }

    async getWorkflow(id: string): Promise<Tool> {
      const query = `
        query GetWorkflow($id: ID!) {
          getWorkflow(id: $id) {
            id
            version
            createdAt
            updatedAt
            steps {
              id
              modify
              apiConfig {
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
                documentationUrl
                responseSchema
                responseMapping
                authentication
                pagination {
                  type
                  pageSize
                  cursorPath
                  stopCondition
                }
                dataPath
              }
              integrationId
              executionMode
              loopSelector
              loopMaxIters
              inputMapping
              responseMapping
              failureBehavior
            }
            integrationIds
            finalTransform
            inputSchema
            responseSchema
            instruction
            folder
          }
        }
      `;
      const response = await this.request<{ getWorkflow: Tool }>(query, { id });
      return response.getWorkflow;
    }

    async listWorkflows(limit: number = 10, offset: number = 0): Promise<{ items: Tool[], total: number }> {
      const query = `
        query ListWorkflows($limit: Int!, $offset: Int!) {
          listWorkflows(limit: $limit, offset: $offset) {
            items {${SuperglueClient.workflowQL}}
            total
          }
        }
      `;
      const response = await this.request<{ listWorkflows: { items: Tool[], total: number } }>(query, { limit, offset });
      return response.listWorkflows;
    }

    async listWorkflowSchedules(workflowId: string): Promise<ToolSchedule[]> {
      const query = `
        query ListWorkflowSchedules ($workflowId: String!) {
          listWorkflowSchedules(workflowId: $workflowId) {
            ${SuperglueClient.workflowScheduleQL}
          }
        }
      `;
      const response = await this.request<{ listWorkflowSchedules: ToolSchedule[] }>(query, { workflowId });
      return response.listWorkflowSchedules;
    }

    async upsertWorkflowSchedule(schedule: ToolScheduleInput): Promise<ToolSchedule> {
      const mutation = `
        mutation UpsertWorkflowSchedule($schedule: WorkflowScheduleInput!) {
          upsertWorkflowSchedule(schedule: $schedule) {
            ${SuperglueClient.workflowScheduleQL}
          }
        }
      `;
      const response = await this.request<{ upsertWorkflowSchedule: ToolSchedule }>(mutation, { schedule });
      return response.upsertWorkflowSchedule;
    }

    async deleteWorkflowSchedule(id: string): Promise<boolean> {
      const mutation = `
        mutation DeleteWorkflowSchedule($id: ID!) {
          deleteWorkflowSchedule(id: $id)
        }
      `;
      const response = await this.request<{ deleteWorkflowSchedule: boolean }>(mutation, { id });
      return response.deleteWorkflowSchedule;
    }

    async upsertApi(id: string, input: Partial<ApiConfig>): Promise<ApiConfig> {
      const mutation = `
        mutation UpsertApi($id: ID!, $input: JSON!) {
          upsertApi(id: $id, input: $input) {
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
            documentationUrl
            responseSchema
            responseMapping
            authentication
            pagination {
              type
              pageSize
              cursorPath
              stopCondition
            }
            dataPath
          }
        }
      `;
      const response = await this.request<{ upsertApi: ApiConfig }>(mutation, { id, input });
      return response.upsertApi;
    }

    async deleteApi(id: string): Promise<boolean> {
      const mutation = `
        mutation DeleteApi($id: ID!) {
          deleteApi(id: $id)
        }
      `;
      const response = await this.request<{ deleteApi: boolean }>(mutation, { id });
      return response.deleteApi;
    }

    async updateApiConfigId(oldId: string, newId: string): Promise<ApiConfig> {
      const mutation = `
        mutation UpdateApiConfigId($oldId: ID!, $newId: ID!) {
          updateApiConfigId(oldId: $oldId, newId: $newId) {
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
            documentationUrl
            responseSchema
            responseMapping
            authentication
            pagination {
              type
              pageSize
              cursorPath
              stopCondition
            }
            dataPath
          }
        }
      `;
      const response = await this.request<{ updateApiConfigId: ApiConfig }>(mutation, { oldId, newId });
      return response.updateApiConfigId;
    }

    async generateSchema(instruction: string, responseData: string): Promise<any> {
      const query = `
        query GenerateSchema($instruction: String!, $responseData: String) {
          generateSchema(instruction: $instruction, responseData: $responseData)
        }
      `;
      const response = await this.request<{ generateSchema: string }>(query, { instruction, responseData });
      return response.generateSchema;
    }

    async upsertWorkflow(id: string, input: Partial<Tool>): Promise<Tool> {
      const mutation = `
        mutation UpsertWorkflow($id: ID!, $input: JSON!) {
          upsertWorkflow(id: $id, input: $input) {${SuperglueClient.workflowQL}}
        }
      `;

      return this.request<{ upsertWorkflow: Tool }>(mutation, { id, input })
        .then(data => data.upsertWorkflow);
    }

  async deleteWorkflow(id: string): Promise<boolean> {
    const mutation = `
      mutation DeleteWorkflow($id: ID!) {
        deleteWorkflow(id: $id)
      }
    `;
    return this.request<{ deleteWorkflow: boolean }>(mutation, { id })
      .then(data => data.deleteWorkflow);
  }

  async renameWorkflow(oldId: string, newId: string): Promise<Tool> {
    const mutation = `
      mutation RenameWorkflow($oldId: ID!, $newId: ID!) {
        renameWorkflow(oldId: $oldId, newId: $newId) {${SuperglueClient.workflowQL}}
      }
    `;
    return this.request<{ renameWorkflow: Tool }>(mutation, { oldId, newId })
      .then(data => data.renameWorkflow);
  }

  async listIntegrations(limit: number = 10, offset: number = 0): Promise<{ items: Integration[], total: number }> {
      const query = `
        query ListIntegrations($limit: Int!, $offset: Int!) {
          listIntegrations(limit: $limit, offset: $offset) {
            items {
              id
              name
              type
              urlHost
              urlPath
              credentials
              documentationUrl
              documentationPending
              openApiSchema
              openApiUrl
              specificInstructions
              documentationKeywords
              icon
              version
              createdAt
              updatedAt
            }
            total
          }
        }
      `;
      const response = await this.request<{ listIntegrations: { items: Integration[], total: number } }>(query, { limit, offset });
      return response.listIntegrations;
    }

    async findRelevantIntegrations(searchTerms: string): Promise<Integration[]> {
      const query = `
        query FindRelevantIntegrations($searchTerms: String) {
          findRelevantIntegrations(searchTerms: $searchTerms) {
            reason
            integration {
              id
              name
              type
              urlHost
              urlPath
              credentials
              documentationUrl
              documentation
              documentationPending
              openApiUrl
              openApiSchema
              specificInstructions
              documentationKeywords
              icon
              version
              createdAt
              updatedAt
            }
          }
        }
      `;
      const response = await this.request<{ findRelevantIntegrations: Integration[] }>(query, { searchTerms });
      return response.findRelevantIntegrations;
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
              integrationId
              instruction
            }
            reason
          }
        }
      `;
      const response = await this.request<{ findRelevantTools: SuggestedTool[] }>(query, { searchTerms });
      return response.findRelevantTools;
    }

    async getIntegration(id: string): Promise<Integration> {
      const query = `
        query GetIntegration($id: ID!) {
          getIntegration(id: $id) {
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
            version
            createdAt
            updatedAt
          }
        }
      `;
      const response = await this.request<{ getIntegration: Integration }>(query, { id });
      return response.getIntegration;
    }

    async upsertIntegration(id: string, input: Partial<Integration>, mode: UpsertMode = UpsertMode.UPSERT): Promise<Integration> {
      const mutation = `
        mutation UpsertIntegration($input: IntegrationInput!, $mode: UpsertMode) {
          upsertIntegration(input: $input, mode: $mode) {
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
            version
            createdAt
            updatedAt
          }
        }
      `;
      const integrationInput = { id, ...input };
      const response = await this.request<{ upsertIntegration: Integration }>(mutation, { input: integrationInput, mode });
      return response.upsertIntegration;
    }

    async deleteIntegration(id: string): Promise<boolean> {
      const mutation = `
        mutation DeleteIntegration($id: ID!) {
          deleteIntegration(id: $id)
        }
      `;
      const response = await this.request<{ deleteIntegration: boolean }>(mutation, { id });
      return response.deleteIntegration;
    }

    async cacheOauthClientCredentials(args: { clientCredentialsUid: string; clientId: string; clientSecret: string }): Promise<boolean> {
        const data = await this.graphQL<{ cacheOauthClientCredentials: boolean }>(`
            mutation CacheOauthClientCredentials($clientCredentialsUid: String!, $clientId: String!, $clientSecret: String!) {
                cacheOauthClientCredentials(clientCredentialsUid: $clientCredentialsUid, clientId: $clientId, clientSecret: $clientSecret)
            }
        `, args);
        return Boolean(data?.cacheOauthClientCredentials);
    }

    async getOAuthClientCredentials(args: { templateId?: string; clientCredentialsUid?: string }): Promise<{ client_id: string; client_secret: string }> {
        const data = await this.graphQL<{ getOAuthClientCredentials: { client_id: string; client_secret: string } }>(`
            mutation GetOAuthClientCredentials($templateId: ID, $clientCredentialsUid: String) {
                getOAuthClientCredentials(templateId: $templateId, clientCredentialsUid: $clientCredentialsUid) {
                    client_id
                    client_secret
                }
            }
        `, args);
        return data.getOAuthClientCredentials;
    }

    async searchIntegrationDocumentation(integrationId: string, keywords: string): Promise<string> {
        const data = await this.graphQL<{ searchIntegrationDocumentation: string }>(`
            query SearchIntegrationDocumentation($integrationId: ID!, $keywords: String!) {
                searchIntegrationDocumentation(integrationId: $integrationId, keywords: $keywords)
            }
        `, { integrationId, keywords });
        return data.searchIntegrationDocumentation;
    }

    async generateInstructions(integrations: any[]): Promise<string[]> {
        const data = await this.graphQL<{ generateInstructions: string[] }>(`
            query GenerateInstructions($integrations: [IntegrationInput!]!) {
                generateInstructions(integrations: $integrations)
            }
        `, { integrations });
        
        const instructions = data.generateInstructions;
        if (instructions.length === 1 && instructions[0].startsWith('Error:')) {
            throw new Error(instructions[0].replace('Error: ', ''));
        }
        return instructions;
    }

    async generateTransform(args: {
        currentTransform: string;
        responseSchema?: any;
        stepData: Record<string, any>;
        errorMessage?: string;
        instruction?: string;
    }): Promise<{ transformCode: string; data?: any }> {
        const mutation = `
            mutation GenerateTransform(
                $currentTransform: String!,
                $responseSchema: JSONSchema,
                $stepData: JSON!,
                $errorMessage: String,
                $instruction: String
            ) {
                generateTransform(
                    currentTransform: $currentTransform,
                    responseSchema: $responseSchema,
                    stepData: $stepData,
                    errorMessage: $errorMessage,
                    instruction: $instruction
                ) {
                    transformCode
                    data
                }
            }
        `;

        const response = await this.request<{ generateTransform: { transformCode: string; data?: any } }>(mutation, args);
        return response.generateTransform;
    }
}
