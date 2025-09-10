import { Workflow } from '@superglue/client';

/**
 * Comprehensive JSON schemas for Workflow REST API endpoints
 * 
 * This file defines all schemas used by Fastify for request/response validation
 * and OpenAPI documentation generation. The schemas are structured to match
 * the Workflow interface from @superglue/client.
 * 
 * Schema structure:
 * - workflow: Base Workflow object schema
 * - pagination: Pagination metadata schema  
 * - error: Common error response schema
 * - getWorkflows, getWorkflow, createWorkflow, updateWorkflow, deleteWorkflow: Endpoint-specific schemas
 */

// Base schemas defined first to avoid circular references
const baseWorkflowSchema = {
    type: 'object',
    properties: {
      id: { 
        type: 'string',
        description: 'Unique identifier for the workflow'
      },
      // TODO: Decide how granular we want to make the schema.
      // We could also just return an object which gives us flexibility to change it later
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            apiConfig: { 
              type: 'object',
              properties: {
                id: { type: 'string' },
                version: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                urlHost: { type: 'string' },
                urlPath: { type: 'string' },
                instruction: { type: 'string' },
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] },
                queryParams: { type: 'object', additionalProperties: true },
                headers: { type: 'object', additionalProperties: true },
                body: { type: 'string' },
                documentationUrl: { type: 'string' },
                responseSchema: { type: 'object', additionalProperties: true },
                responseMapping: { type: 'string' },
                authentication: { type: 'string', enum: ['NONE', 'OAUTH2', 'HEADER', 'QUERY_PARAM'] },
                pagination: { type: 'object', properties: { type: { type: 'string', enum: ['OFFSET_BASED', 'PAGE_BASED', 'CURSOR_BASED', 'DISABLED'] }, pageSize: { type: 'string' }, cursorPath: { type: 'string' }, stopCondition: { type: 'string' } } },
                dataPath: { type: 'string' }
              },
              required: ['id', 'instruction']
            },
            integrationId: { type: 'string' },
            executionMode: { type: 'string', enum: ['DIRECT', 'LOOP'] },
            loopSelector: { type: 'string' },
            loopMaxIters: { type: 'number' },
            inputMapping: { type: 'string' },
            responseMapping: { type: 'string' }
          },
          required: ['id', 'apiConfig']
        },
        description: 'Array of execution steps in the workflow'
      },
      integrationIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of integration IDs used in the workflow'
      },
      finalTransform: {
        type: 'string',
        description: 'Final transformation to apply to the workflow result'
      },
      inputSchema: {
        type: 'object',
        description: 'JSON schema for workflow input validation'
      },
      responseSchema: {
        type: 'object',
        description: 'JSON schema for workflow response structure'
      },
      instruction: {
        type: 'string',
        description: 'Natural language description of what the workflow does'
      },
      originalResponseSchema: {
        type: 'object',
        description: 'Original response schema before any modifications'
      },
      createdAt: {
        type: 'string',
        format: 'date-time',
        description: 'When the workflow was created'
      },
      updatedAt: {
        type: 'string',
        format: 'date-time',
        description: 'When the workflow was last updated'
      },
      version: { 
        type: 'string',
        description: 'Version of the workflow'
      },
    },
    required: ['id','steps']
  };

const basePaginationSchema = {
    type: 'object',
    properties: {
      total: {
        type: 'integer',
        description: 'Total number of items across all pages'
      },
      limit: {
        type: 'integer',
        description: 'Number of items per page'
      },
      offset: {
        type: 'integer',
        description: 'Number of items to skip'
      }
    },
    required: ['total', 'limit', 'offset']
  };

const baseErrorSchema = {
    type: 'object',
    properties: {
      error: {
        type: 'string',
        description: 'Error code identifier'
      },
      message: {
        type: 'string',
        description: 'Human-readable error message'
      },
      field: {
        type: 'string',
        description: 'Field that caused the validation error (optional)'
      }
    },
    required: ['error', 'message']
  };

export const workflowSchemas = {
  // Export base schemas
  workflow: baseWorkflowSchema,
  pagination: basePaginationSchema,
  error: baseErrorSchema,

  getWorkflows: {
    querystring: {
      type: 'object',
      properties: {
        limit: { 
          type: 'string', 
          pattern: '^[1-9][0-9]*$',
          description: 'Number of workflows to return (1-100)',
          default: '10'
        },
        offset: { 
          type: 'string', 
          pattern: '^[0-9]+$',
          description: 'Number of workflows to skip',
          default: '0'
        },
        integrationIds: { 
          type: 'string',
          description: 'Filter by integration IDs (comma-separated list)'
        },
        updatedAfter: { 
          type: 'string',
          format: 'date-time',
          description: 'Filter workflows updated after this date'
        },
        updatedBefore: { 
          type: 'string',
          format: 'date-time',
          description: 'Filter workflows updated before this date'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: baseWorkflowSchema
          },
          pagination: basePaginationSchema
        }
      },
      500: baseErrorSchema
    }
  },

  getWorkflow: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    response: {
      200: baseWorkflowSchema,
      404: baseErrorSchema,
      500: baseErrorSchema
    }
  },

  createWorkflow: {
    body: {
      type: 'object',
      required: ['id', 'data'],
      properties: {
        id: { 
          type: 'string', 
          minLength: 1,
          description: 'ID of the workflow'
        },
        version: { 
          type: 'string', 
          minLength: 1,
          description: 'Version of the workflow'
        },
        data: { 
          type: 'object',
          description: 'Workflow configuration data'
        }
      }
    },
    response: {
      201: baseWorkflowSchema,
      400: baseErrorSchema,
      500: baseErrorSchema
    }
  },

  updateWorkflow: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    body: {
      type: 'object',
      required: ['data'],
      properties: {
        version: { 
          type: 'string', 
          minLength: 1,
          description: 'Version of the workflow'
        },
        data: { 
          type: 'object',
          description: 'Workflow configuration data'
        }
      }
    },
    response: {
      200: baseWorkflowSchema,
      400: baseErrorSchema,
      404: baseErrorSchema,
      500: baseErrorSchema
    }
  },

  deleteWorkflow: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    response: {
      204: {
        type: 'null',
        description: 'Workflow deleted successfully'
      },
      404: baseErrorSchema,
      500: baseErrorSchema
    }
  },

  buildWorkflow: {
    body: {
      type: 'object',
      required: ['instruction', 'integrationIds'],
      properties: {
        instruction: {
          type: 'string',
          minLength: 1,
          description: 'Natural language instruction describing what the workflow should do'
        },
        payload: {
          type: 'object',
          additionalProperties: true,
          description: 'Sample payload data to help build the workflow'
        },
        integrationIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Array of integration IDs to use in the workflow'
        },
        responseSchema: {
          type: 'object',
          additionalProperties: true,
          description: 'Expected response schema for the workflow'
        }
      }
    },
    response: {
      200: baseWorkflowSchema,
      400: baseErrorSchema,
      500: baseErrorSchema
    }
  }
};
