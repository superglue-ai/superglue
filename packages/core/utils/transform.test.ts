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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import dotenv from 'dotenv';
import { applyJsonataWithValidation } from './tools.js';
import { TransformConfig } from '@superglue/client';
import { generateMapping, prepareTransform } from './transform.js';
import { LanguageModel as mockLLM } from '../llm/llm.js';

describe('transform utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dotenv.config();
    (mockLLM as any).generateObject.mockReset();
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
      const result = await prepareTransform(mockDataStore, false, input, {}, null, { orgId: testOrgId });
      expect(result).toBeNull();
    });

    it('should create new config if responseMapping is provided', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;          
      const input = {
        ...sampleInput,
        responseMapping: 'test-mapping'
      };
      
      const result = await prepareTransform(mockDataStore, false, input, { product: { name: 'test' } }, null, { orgId: testOrgId });
      
      expect(result).toMatchObject({
        responseMapping: 'test-mapping',
        responseSchema: input.responseSchema
      });
      expect(result?.id).toBeDefined();
      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.updatedAt).toBeInstanceOf(Date);
    });

    
    it('should generate new mapping if no responseMapping is provided', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;

      // First call: generateObject for mapping
      (mockLLM as any).generateObject
        .mockResolvedValueOnce({
          response: {
            jsonata: '{"name": user.firstName & " " & user.lastName}',
            confidence: 95,
            confidence_reasoning: 'Direct field mapping available'
          },
          messages: []
        })
        // Second call: generateObject for evaluateMapping
        .mockResolvedValueOnce({
          response: {
            success: true,
            reason: "Transformation is correct, complete, and aligns with the objectives."
          }
        });

      const transform = await prepareTransform(mockDataStore, false, sampleInput, samplePayload, null, { orgId: testOrgId });
      const result = await applyJsonataWithValidation(samplePayload, transform.responseMapping, sampleInput.responseSchema);
      expect(result).toMatchObject({
        success: true,
        data: {
          name: 'John Doe'
        }
      });
    });
  });

  describe('generateMapping', () => {
    beforeEach(() => {
      // Clear all mocks before each test
      vi.clearAllMocks();
      // Reset modules to ensure clean mocks
      vi.resetModules();

      (mockLLM as any).generateObject.mockReset();
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
      (mockLLM as any).generateObject
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

      const mapping = await generateMapping(sampleSchema, samplePayload, 'test-instruction', {});
      expect(mapping).toBeDefined();

      const result = await applyJsonataWithValidation(samplePayload, mapping.jsonata, sampleSchema);
      expect(result).toEqual({
        success: true,
        data: {
          name: 'John Doe'
        }
      });
    }, 30000);

    it('should retry on failure', async () => {
      let attempts = 0;
      (mockLLM as any).generateObject.mockRejectedValueOnce(attempts++ === 0 ? new Error('API Error') : null);
      (mockLLM as any).generateObject.mockResolvedValueOnce({
        response: {
            jsonata: '{"name": user.firstName & " " & user.lastName}',
            confidence: 95,
            confidence_reasoning: 'Direct field mapping available'
        },
        messages: []
      });
      const result = await generateMapping(sampleSchema, samplePayload, 'test-instruction', {});
      expect(result).toBeDefined();
      expect(attempts).toBe(1);
    });

    it('should return null after max retries', async () => {
      (mockLLM as any).generateObject.mockRejectedValue(new Error('API Error'));

      const result = await generateMapping(sampleSchema, samplePayload, 'test-instruction', {});
      expect(result).toBeNull();
    });
  });
});