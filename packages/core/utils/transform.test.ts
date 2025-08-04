// Mock declarations must come before any imports
vi.mock('../llm/llm.js', async () => {
  const mockLLM = {
    generateText: vi.fn(),
    generateObject: vi.fn()
  };
  return {
    LanguageModel: mockLLM
  };
});

vi.mock('./transform.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    evaluateMapping: vi.fn().mockResolvedValue({ success: true, reason: "mocked" }),
  };
});

vi.mock('./tools.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    transformAndValidateSchema: vi.fn().mockImplementation(async (data, expr, schema) => {
      if (expr === 'test-mapping') {
        return { success: false, error: 'Invalid mapping: test-mapping' };
      }
      return actual.transformAndValidateSchema(data, expr, schema);
    }),
  };
});

import { TransformConfig } from '@superglue/client';
import dotenv from 'dotenv';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageModel } from '../llm/llm.js';
import { transformAndValidateSchema } from './tools.js';
import { executeTransform } from './transform.js';

describe('transform utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dotenv.config();
    (LanguageModel as any).generateObject.mockReset();
  });

  describe('prepareTransform', () => {
    const testOrgId = 'test-org';
    const sampleInput: TransformConfig = {
      id: 'test-transform-id',
      instruction: 'get the full name from the user',
      responseSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      }
    };
    const samplePayload = {
      user: {
        firstName: 'John',
        lastName: 'Doe'
      }
    };

    it('should return null if responseSchema is empty', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;
      const input = { ...sampleInput, responseSchema: {} };
      await expect(executeTransform({
        datastore: mockDataStore,
        fromCache: false,
        input: { endpoint: input },
        data: {},
        metadata: { orgId: testOrgId }
      })).rejects.toThrow('Failed to generate transformation mapping');
    });

    it('should create new config if responseMapping is provided', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;

      (LanguageModel as any).generateObject.mockResolvedValueOnce({
        response: {
          mappingCode: '(sourceData) => {\n  return { name: sourceData.product.name };\n};\n',
          confidence: 95
        },
        messages: []
      }).mockResolvedValueOnce({
        response: {
          success: true,
          reason: "Transformation is correct, complete, and aligns with the objectives."
        },
        messages: []
      });

      const input = {
        ...sampleInput,
        responseMapping: 'test-mapping'
      };

      const result = await executeTransform({
        datastore: mockDataStore,
        fromCache: false,
        input: { endpoint: input },
        data: { product: { name: 'test' } },
        metadata: { orgId: testOrgId }
      });

      expect(result.config).toMatchObject({
        responseMapping: '(sourceData) => {\n  return { name: sourceData.product.name };\n};\n',
        responseSchema: input.responseSchema
      });
      expect(result.config?.id).toBeDefined();
      expect(result.config?.createdAt).toBeInstanceOf(Date);
      expect(result.config?.updatedAt).toBeInstanceOf(Date);
    });

    it('should generate new mapping if no responseMapping is provided', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;

      (LanguageModel as any).generateObject
        .mockResolvedValueOnce({
          response: {
            mappingCode: '(sourceData) => {return {name: sourceData.user.firstName + " " + sourceData.user.lastName}}',
            confidence: 95
          },
          messages: []
        })
        .mockResolvedValueOnce({
          response: {
            success: true,
            reason: "Transformation is correct, complete, and aligns with the objectives."
          },
          messages: []
        });

      const transform = await executeTransform({
        datastore: mockDataStore,
        fromCache: false,
        input: { endpoint: sampleInput },
        data: samplePayload,
        metadata: { orgId: testOrgId }
      });
      const result = await transformAndValidateSchema(samplePayload, transform.config.responseMapping, sampleInput.responseSchema);
      expect(result).toMatchObject({
        success: true,
        data: {
          name: 'John Doe'
        }
      });
    });
  });
});