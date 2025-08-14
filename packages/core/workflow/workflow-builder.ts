import { ExecutionStep, Integration, Workflow } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { type OpenAI } from "openai";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { toJsonSchema } from "../external/json-schema.js";
import { BUILD_WORKFLOW_SYSTEM_PROMPT } from "../llm/prompts.js";
import { executeTool } from "../tools/tools.js";
import { Documentation } from "../utils/documentation.js";
import { logMessage } from "../utils/logs.js";
import { composeUrl, sample } from "../utils/tools.js";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export class WorkflowBuilder {
  private integrations: Record<string, Integration>;
  private instruction: string;
  private initialPayload: Record<string, unknown>;
  private metadata: Metadata;
  private responseSchema: JSONSchema;
  private inputSchema: JSONSchema;

  constructor(
    instruction: string,
    integrations: Integration[],
    initialPayload: Record<string, unknown>,
    responseSchema: JSONSchema,
    metadata: Metadata
  ) {
    this.integrations = integrations.reduce((acc, int) => {
      acc[int.id] = int;
      return acc;
    }, {} as Record<string, Integration>);
    this.instruction = instruction;
    this.initialPayload = initialPayload || {};
    this.metadata = metadata;
    this.responseSchema = responseSchema;
    try {
      const credentials = Object.values(integrations).reduce((acc, int) => {
        return { ...acc, ...Object.entries(int.credentials || {}).reduce((obj, [name, value]) => ({ ...obj, [`${int.id}_${name}`]: value }), {}) };
      }, {});
      this.inputSchema = toJsonSchema(
        {
          payload: this.initialPayload,
          credentials: credentials
        },
        { arrays: { mode: 'all' }, }
      ) as unknown as JSONSchema;
    } catch (error) {
      logMessage('error', `Error during payload parsing: ${error}`, this.metadata);
      throw new Error(`Error during payload parsing: ${error}`);
    }
  }

  private generateIntegrationDescriptions(): string {
    return Object.values(this.integrations).map(int => {
      if (!int.documentation) {
        return `<${int.id}>
  Base URL: ${composeUrl(int.urlHost, int.urlPath)}
  <specific_instructions>
  ${int.specificInstructions?.length > 0 ? int.specificInstructions : "No specific instructions provided."}
  </specific_instructions>
</${int.id}>`;
      }
      const authSection = Documentation.extractRelevantSections(
        int.documentation,
        "authentication authorization api key token bearer basic oauth credentials access private app secret",
        3,  // fewer sections needed for auth
        2000 // should be detailed though
      );

      const paginationSection = Documentation.extractRelevantSections(
        int.documentation,
        "pagination page offset cursor limit per_page pageSize after next previous paging paginated results list",
        3,  // max 3 sections
        2000 // same logic applies here
      );
      const generalSection = Documentation.extractRelevantSections(
        int.documentation,
        this.instruction + "reference object endpoints methods properties values fields enums search query filter list create update delete get put post patch",
        20,  // max 20 sections
        1000 // should cover examples, endpoints etc.
      );

      return `<${int.id}>
  Base URL: ${composeUrl(int.urlHost, int.urlPath)}
  <specific_instructions>
  ${int.specificInstructions?.length > 0 ? int.specificInstructions : "No specific instructions provided."}
  </specific_instructions>
  <documentation>
${authSection ? `<authentication>
${authSection}
</authentication>` : ''}
    
    ${paginationSection && paginationSection != authSection ? `<pagination>
    ${paginationSection}
    </pagination>` : ''}
    
    <context_relevant_to_user_instruction>
    ${generalSection && generalSection != authSection && generalSection != paginationSection ? generalSection : 'No general documentation found.'}
    </context_relevant_to_user_instruction>
  </documentation>
</${int.id}>`;
    }).join("\n");
  }

  private generatePayloadDescription(maxLength: number = 4000): string {
    if (!this.initialPayload || Object.keys(this.initialPayload).length === 0) {
      return 'No initial payload provided';
    }

    let payloadText = JSON.stringify(this.initialPayload);
    if (payloadText.length > maxLength) {
      payloadText = JSON.stringify(sample(this.initialPayload, 3), null, 2);
    }
    if (payloadText.length > maxLength) {
      payloadText = payloadText.slice(0, maxLength) + '...[truncated]';
    }

    return `Initial Input Payload contains keys: ${Object.keys(this.initialPayload).join(", ")}\nPayload example: ${payloadText}`;
  }

  private prepareBuildingContext(): ChatMessage[] {
    const integrationDescriptions = this.generateIntegrationDescriptions();
    const initialPayloadDescription = this.generatePayloadDescription();

    const availableVariables = [
      ...Object.values(this.integrations).flatMap(int => Object.keys(int.credentials || {}).map(k => `<<${int.id}_${k}>>`)),
      ...Object.keys(this.initialPayload || {}).map(k => `<<${k}>>`)
    ].join(", ");

    const buildingPromptForAgent = `
Build a complete workflow to fulfill the user's request.

<user_instruction>
${this.instruction}
</user_instruction>

<available_integrations_and_documentation>
${integrationDescriptions}
</available_integrations_and_documentation>

<available_variables>
${availableVariables}
</available_variables>

<initial_payload>
${initialPayloadDescription}
</initial_payload>

Ensure that the final output matches the instruction and you use ONLY the available integration ids.`;

    return [
      { role: "system", content: BUILD_WORKFLOW_SYSTEM_PROMPT },
      { role: "user", content: buildingPromptForAgent }
    ];
  }

  private validateWorkflow(workflow: Workflow): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const availableIntegrationIds = Object.keys(this.integrations);

    // Check each step for validation errors
    workflow.steps?.forEach((step, index) => {
      // Assertion 1: Check if integration ID is present and available
      if (!step.integrationId) {
        errors.push(`Step ${index + 1} (${step.id}): Missing integrationId`);
      } else if (!availableIntegrationIds.includes(step.integrationId)) {
        errors.push(`Step ${index + 1} (${step.id}): Invalid integrationId '${step.integrationId}'. Available integrations: ${availableIntegrationIds.join(', ')}`);
      }
      // Assertion 2: Check for empty / invalid workflow steps
      if (!step.apiConfig?.urlHost) {
        errors.push(`Step ${index + 1} (${step.id}): Missing URL configuration (urlHost: '${step.apiConfig?.urlHost || 'undefined'}'). Please ensure that all steps correspond to a single API call, or merge this step with the previous one.`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public async buildWorkflow(): Promise<Workflow> {
    let builtWorkflow: Workflow | null = null;
    let messages = this.prepareBuildingContext();
    let retryCount = 0;
    const maxRetries = 3;
    let lastError: string | null = null;

    while (retryCount < maxRetries) {
      try {
        logMessage('info', `Building workflow${retryCount > 0 ? ` (attempt ${retryCount + 1}/${maxRetries})` : ''}`, this.metadata);

        const toolMetadata = {
          ...this.metadata,
          messages
        };

        // Call the build_workflow tool
        const result = await executeTool(
          {
            id: `build-workflow`,
            name: 'build_workflow',
            arguments: retryCount > 0 ? { previousError: lastError } : {}
          },
          toolMetadata
        );

        if (result.error) {
          throw new Error(result.error);
        }

        if (!result.data || !(result.data?.id)) {
          throw new Error('No workflow generated');
        }

        builtWorkflow = result.data;

        // Validate the workflow
        const validation = this.validateWorkflow(builtWorkflow);
        if (!validation.valid) {
          const errorDetails = validation.errors.join('\n');
          const workflowSummary = JSON.stringify({
            id: builtWorkflow.id,
            steps: builtWorkflow.steps?.map(s => ({
              id: s.id,
              integrationId: s.integrationId,
              urlHost: s.apiConfig?.urlHost,
              urlPath: s.apiConfig?.urlPath
            }))
          }, null, 2);

          throw new Error(`Workflow validation failed:\n${errorDetails}\n\nGenerated workflow:\n${workflowSummary}`);
        }

        // Validation passed, finalize the workflow
        builtWorkflow.instruction = this.instruction;
        builtWorkflow.responseSchema = this.responseSchema;
        try {
          builtWorkflow.originalResponseSchema = await this.generateOriginalResponseSchema(builtWorkflow.steps);
        } catch (error) {
          logMessage('warn', `Error generating original response schema: ${error}`, this.metadata);
        }

        // Success - break out of retry loop
        break;

      } catch (error: any) {
        lastError = error.message;
        logMessage('error', `Error during workflow build attempt ${retryCount + 1}: ${error.message}`, this.metadata);

        // Add error feedback to messages for next retry
        if (retryCount < maxRetries - 1) {
          messages.push({
            role: "user",
            content: `The previous workflow build attempt failed with the following error:\n\n${error.message}\n\nPlease fix these issues and generate a valid workflow.`
          } as ChatMessage);
        }

        retryCount++;
      }
    }

    if (!builtWorkflow) {
      const finalErrorMsg = `Workflow build failed after ${maxRetries} attempts. Last error: ${lastError}`;
      logMessage('error', finalErrorMsg, this.metadata);
      throw new Error(finalErrorMsg);
    }

    return {
      id: builtWorkflow.id,
      steps: builtWorkflow.steps,
      integrationIds: Object.keys(this.integrations),
      instruction: this.instruction,
      finalTransform: builtWorkflow.finalTransform,
      originalResponseSchema: builtWorkflow.originalResponseSchema,
      responseSchema: this.responseSchema,
      inputSchema: this.inputSchema,
      createdAt: builtWorkflow.createdAt || new Date(),
      updatedAt: builtWorkflow.updatedAt || new Date(),
    };
  }
  async generateOriginalResponseSchema(steps: ExecutionStep[]): Promise<JSONSchema> {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const step of steps) {
      // Get the integration for this step
      const integration = this.integrations[step.integrationId];

      if (!integration) {
        logMessage('warn', `Integration ${step.integrationId} not found for step ${step.id}`, this.metadata);
        // Add a generic schema for this step
        properties[step.id] = {
          type: "object",
          description: `Response data from step ${step.id}`
        };
        continue;
      }

      // Try to extract response schema from OpenAPI documentation
      let stepResponseSchema: any = {
        type: "object",
        description: `Response data from ${integration.id} API for step ${step.id}`
      };

      if (integration.openApiSchema) {
        try {
          // Try to parse OpenAPI documentation if available
          const openApiDoc = await this.parseOpenApiDocumentation(integration.openApiSchema, step.apiConfig);
          if (openApiDoc) {
            stepResponseSchema = openApiDoc;
          }
        } catch (error) {
          logMessage('debug', `Failed to extract OpenAPI schema for step ${step.id}: ${error}`, this.metadata);
        }
      }

      // If it's a LOOP execution mode, wrap the schema in an array
      if (step.executionMode === "LOOP") {
        properties[step.id] = {
          type: "array",
          items: stepResponseSchema,
          description: `Array of responses from looped execution of step ${step.id}`
        };
      } else {
        properties[step.id] = stepResponseSchema;
      }

      required.push(step.id);
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false
    } as JSONSchema;
  }

  private async parseOpenApiDocumentation(openApiSchema: string, apiConfig: any): Promise<any | null> {
    if (!openApiSchema) {
      return null;
    }

    try {
      // Parse the schema JSON
      let spec = JSON.parse(openApiSchema);

      if (!spec) {
        return null;
      }

      // Check if it's a Google Discovery schema
      if (spec.resources && !spec.openapi && !spec.swagger) {
        return this.parseGoogleDiscoverySchema(spec, apiConfig);
      }

      // Otherwise, treat it as an OpenAPI schema
      return this.parseOpenApiSchema(spec, apiConfig);
    } catch (error) {
      logMessage('debug', `Error parsing API schema documentation: ${error}`, this.metadata);
      return null;
    }
  }

  private parseOpenApiSchema(openApiSpec: any, apiConfig: any): any | null {
    // Extract response schema based on the API endpoint
    const { urlPath, method } = apiConfig;
    if (!urlPath || !method) {
      return null;
    }

    // Clean up the path (remove variable syntax)
    const cleanPath = urlPath.replace(/<<[^>]+>>/g, '{param}')
      .replace(/\{[^}]+\}/g, (match) => match.toLowerCase());

    // Look for the path in the OpenAPI spec
    const paths = openApiSpec.paths || openApiSpec.specifications?.reduce((acc, spec) => ({ ...acc, ...spec.spec.paths }), {}) || {};
    let pathSchema = null;

    // Try to find exact match first
    for (const [path, pathConfig] of Object.entries(paths)) {
      if (this.pathMatches(cleanPath, path)) {
        const methodConfig = pathConfig[method.toLowerCase()];
        if (methodConfig?.responses) {
          // Get the successful response schema (200, 201, etc.)
          const successResponse = methodConfig.responses['200'] ||
            methodConfig.responses['201'] ||
            methodConfig.responses['2XX'] ||
            methodConfig.responses['default'];

          if (successResponse?.content) {
            // Extract schema from content type
            const content = successResponse.content['application/json'] ||
              successResponse.content['*/*'] ||
              Object.values(successResponse.content)[0];

            if (content?.schema) {
              pathSchema = this.resolveOpenApiSchema(content.schema, openApiSpec);
              break;
            }
          } else if (successResponse?.schema) {
            // OpenAPI 2.0 format
            pathSchema = this.resolveOpenApiSchema(successResponse.schema, openApiSpec);
            break;
          }
        }
      }
    }

    return pathSchema;
  }

  private parseGoogleDiscoverySchema(discoverySpec: any, apiConfig: any): any | null {
    const { urlPath, method } = apiConfig;
    if (!urlPath || !method) {
      return null;
    }

    // Clean up the path
    const cleanPath = urlPath.replace(/<<[^>]+>>/g, '{param}');

    // Recursively search through resources and methods
    const findMethod = (resources: any, currentPath: string = ''): any => {
      if (!resources) return null;

      for (const [resourceName, resource] of Object.entries(resources)) {
        const res = resource as any;
        // Check methods in this resource
        if (res.methods) {
          for (const [methodName, methodConfig] of Object.entries(res.methods)) {
            const method = methodConfig as any;
            const fullPath = method.path || method.flatPath;
            if (fullPath && this.pathMatches(cleanPath, fullPath)) {
              // Check if HTTP method matches
              if (method.httpMethod?.toUpperCase() === apiConfig.method.toUpperCase()) {
                // Found the matching method, extract response
                if (method.response?.$ref) {
                  // Resolve the reference in schemas
                  return this.resolveGoogleDiscoveryRef(method.response.$ref, discoverySpec);
                } else if (method.response) {
                  return this.convertGoogleDiscoverySchema(method.response, discoverySpec);
                }
              }
            }
          }
        }

        // Recursively check nested resources
        if (res.resources) {
          const result = findMethod(res.resources, `${currentPath}/${resourceName}`);
          if (result) return result;
        }
      }

      return null;
    };

    return findMethod(discoverySpec.resources);
  }

  private resolveGoogleDiscoveryRef(ref: string, spec: any): any {
    // Google Discovery refs are direct schema names
    const schemas = spec.schemas || {};
    const schema = schemas[ref];

    if (!schema) {
      logMessage('debug', `Google Discovery schema reference '${ref}' not found in schemas`, this.metadata);
      // Return a generic object schema as fallback
      return {
        type: 'object',
        description: `Response of type ${ref}`
      };
    }

    return this.convertGoogleDiscoverySchema(schema, spec);
  }

  private convertGoogleDiscoverySchema(schema: any, spec: any): any {
    if (!schema) return null;

    // Handle $ref
    if (schema.$ref) {
      return this.resolveGoogleDiscoveryRef(schema.$ref, spec);
    }

    // Convert Google Discovery types to JSON Schema types
    const typeMap: Record<string, string> = {
      'string': 'string',
      'integer': 'integer',
      'number': 'number',
      'boolean': 'boolean',
      'array': 'array',
      'object': 'object',
      'any': 'object'
    };

    const result: any = {};

    if (schema.type) {
      result.type = typeMap[schema.type] || schema.type;
    }

    if (schema.description) {
      result.description = schema.description;
    }

    // Handle array items
    if (schema.type === 'array' && schema.items) {
      result.items = this.convertGoogleDiscoverySchema(schema.items, spec);
    }

    // Handle object properties
    if (schema.properties) {
      result.type = 'object';
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = this.convertGoogleDiscoverySchema(value, spec);
      }
    }

    // Handle additional properties
    if (schema.additionalProperties !== undefined) {
      result.additionalProperties = schema.additionalProperties;
    }

    // Handle required fields
    if (schema.required) {
      result.required = schema.required;
    }

    // Handle enums
    if (schema.enum) {
      result.enum = schema.enum;
    }

    // Handle format
    if (schema.format) {
      result.format = schema.format;
    }

    return result;
  }

  private pathMatches(cleanPath: string, openApiPath: string): boolean {
    // Convert OpenAPI path parameters to regex
    const regexPattern = openApiPath
      .replace(/\{[^}]+\}/g, '[^/]+')
      .replace(/\//g, '\\/');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(cleanPath);
  }

  private resolveOpenApiSchema(schema: any, spec: any): any {
    if (!schema) return null;

    // Handle $ref references
    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/', '').split('/');
      let resolved = spec;
      for (const part of refPath) {
        resolved = resolved?.[part];
      }
      return this.resolveOpenApiSchema(resolved, spec);
    }

    // Handle array types
    if (schema.type === 'array' && schema.items) {
      return {
        type: 'array',
        items: this.resolveOpenApiSchema(schema.items, spec)
      };
    }

    // Handle object types
    if (schema.type === 'object' || schema.properties) {
      const result: any = {
        type: 'object',
        properties: {}
      };

      if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
          result.properties[key] = this.resolveOpenApiSchema(value as any, spec);
        }
      }

      if (schema.required) {
        result.required = schema.required;
      }

      return result;
    }

    // Return primitive types as-is
    return schema;
  }
}
