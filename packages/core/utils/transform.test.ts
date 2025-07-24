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

import { TransformConfig } from '@superglue/client';
import dotenv from 'dotenv';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageModel } from '../llm/llm.js';
import { transformAndValidateSchema } from './tools.js';
import { executeTransform, generateTransformJsonata } from './transform.js';

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
          mappingCode: '(sourceData) => {return { name: sourceData.product.name };}',
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

  describe('generateTransformJsonata', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
      (LanguageModel as any).generateObject.mockReset();
    });

    const sampleSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' }
      }
    };

    const samplePayload = {
      user: {
        firstName: 'John',
        lastName: 'Doe'
      }
    };

    it('should generate mapping successfully', async () => {
      (LanguageModel as any).generateObject
        .mockResolvedValueOnce({
          response: {
            jsonata: '{"name": user.firstName & " " & user.lastName}',
            confidence: 95,
            confidence_reasoning: 'Direct field mapping available'
          },
          messages: []
        })
        .mockResolvedValueOnce({
          response: {
            success: true,
            reason: "Transformation is correct, complete, and aligns with the objectives."
          }
        });

      const mapping = await generateTransformJsonata(sampleSchema, samplePayload, 'test-instruction', {});
      expect(mapping).toBeDefined();

      const result = await transformAndValidateSchema(samplePayload, mapping.jsonata, sampleSchema);
      expect(result).toEqual({
        success: true,
        data: {
          name: 'John Doe'
        }
      });
    }, 30000);

    it('should retry on failure', async () => {
      let attempts = 0;
      (LanguageModel as any).generateObject.mockRejectedValueOnce(attempts++ === 0 ? new Error('API Error') : null);
      (LanguageModel as any).generateObject.mockResolvedValueOnce({
        response: {
          jsonata: '{"name": user.firstName & " " & user.lastName}',
          confidence: 95,
          confidence_reasoning: 'Direct field mapping available'
        },
        messages: []
      });
      const result = await generateTransformJsonata(sampleSchema, samplePayload, 'test-instruction', {});
      expect(result).toBeDefined();
      expect(attempts).toBe(1);
    });

    it('should return null after max retries', async () => {
      (LanguageModel as any).generateObject.mockRejectedValue(new Error('API Error'));

      const result = await generateTransformJsonata(sampleSchema, samplePayload, 'test-instruction', {});
      expect(result).toBeNull();
    });
  });
});