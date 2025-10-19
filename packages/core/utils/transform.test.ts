// Mock declarations must come before any imports
vi.mock('../llm/language-model.js', async () => {
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

import { SelfHealingMode, TransformConfig } from '@superglue/client';
import dotenv from 'dotenv';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageModel } from '../llm/language-model.js';
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

  describe('Transform Self-Healing', () => {
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

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should succeed without self-healing when transform works', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;

      (LanguageModel as any).generateObject.mockResolvedValueOnce({
        response: {
          mappingCode: '(sourceData) => ({ name: sourceData.user.firstName + " " + sourceData.user.lastName })',
          confidence: 95
        },
        messages: []
      }).mockResolvedValueOnce({
        response: {
          success: true,
          reason: "Transformation is correct"
        },
        messages: []
      });

      const result = await executeTransform({
        datastore: mockDataStore,
        fromCache: false,
        input: { endpoint: sampleInput },
        data: samplePayload,
        metadata: { orgId: testOrgId },
        options: { selfHealing: SelfHealingMode.ENABLED }
      });

      expect(result.config.responseMapping).toBeDefined();
      expect(LanguageModel.generateObject).toHaveBeenCalledTimes(2); // Generate + validate
    });

    it('should not regenerate mapping when self-healing disabled and existing mapping fails', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;

      const inputWithMapping = {
        ...sampleInput,
        responseMapping: 'test-mapping' // This will fail according to our mock
      };

      await expect(executeTransform({
        datastore: mockDataStore,
        fromCache: false,
        input: { endpoint: inputWithMapping },
        data: samplePayload,
        metadata: { orgId: testOrgId },
        options: { selfHealing: SelfHealingMode.DISABLED }
      })).rejects.toThrow('Invalid mapping: test-mapping');

      expect(LanguageModel.generateObject).not.toHaveBeenCalled();
    });

    it('should not regenerate mapping when self-healing is request-only and mapping fails', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;

      const inputWithMapping = {
        ...sampleInput,
        responseMapping: 'test-mapping' // This will fail according to our mock
      };

      await expect(executeTransform({
        datastore: mockDataStore,
        fromCache: false,
        input: { endpoint: inputWithMapping },
        data: samplePayload,
        metadata: { orgId: testOrgId },
        options: { selfHealing: SelfHealingMode.REQUEST_ONLY }
      })).rejects.toThrow('Invalid mapping: test-mapping');

      expect(LanguageModel.generateObject).not.toHaveBeenCalled();
    });

    it('should regenerate mapping when self-healing enabled and existing mapping fails', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;

      const inputWithMapping = {
        ...sampleInput,
        responseMapping: 'test-mapping' // This will fail according to our mock
      };

      // Mock successful regeneration
      (LanguageModel as any).generateObject.mockResolvedValueOnce({
        response: {
          mappingCode: '(sourceData) => ({ name: sourceData.user.firstName + " " + sourceData.user.lastName })',
          confidence: 95
        },
        messages: []
      }).mockResolvedValueOnce({
        response: {
          success: true,
          reason: "Regenerated mapping is correct"
        },
        messages: []
      });

      const result = await executeTransform({
        datastore: mockDataStore,
        fromCache: false,
        input: { endpoint: inputWithMapping },
        data: samplePayload,
        metadata: { orgId: testOrgId },
        options: { selfHealing: SelfHealingMode.ENABLED }
      });

      expect(result.config.responseMapping).toBeDefined();
      expect(result.config.responseMapping).not.toBe('test-mapping'); // Should be regenerated
      expect(LanguageModel.generateObject).toHaveBeenCalledTimes(2); // Generate + validate
    });

    it('should regenerate mapping when self-healing is transform-only and mapping fails', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;

      const inputWithMapping = {
        ...sampleInput,
        responseMapping: 'test-mapping' // This will fail according to our mock
      };

      // Mock successful regeneration
      (LanguageModel as any).generateObject.mockResolvedValueOnce({
        response: {
          mappingCode: '(sourceData) => ({ name: sourceData.user.firstName + " " + sourceData.user.lastName })',
          confidence: 95
        },
        messages: []
      }).mockResolvedValueOnce({
        response: {
          success: true,
          reason: "Regenerated mapping is correct"
        },
        messages: []
      });

      const result = await executeTransform({
        datastore: mockDataStore,
        fromCache: false,
        input: { endpoint: inputWithMapping },
        data: samplePayload,
        metadata: { orgId: testOrgId },
        options: { selfHealing: SelfHealingMode.TRANSFORM_ONLY }
      });

      expect(result.config.responseMapping).toBeDefined();
      expect(LanguageModel.generateObject).toHaveBeenCalledTimes(2);
    });

    it('should default to self-healing enabled when options not provided', async () => {
      let mockDataStore = {
        getTransformConfig: vi.fn(),
      } as any;

      const inputWithMapping = {
        ...sampleInput,
        responseMapping: 'test-mapping' // This will fail according to our mock
      };

      // Mock successful regeneration
      (LanguageModel as any).generateObject.mockResolvedValueOnce({
        response: {
          mappingCode: '(sourceData) => ({ name: sourceData.user.firstName + " " + sourceData.user.lastName })',
          confidence: 95
        },
        messages: []
      }).mockResolvedValueOnce({
        response: {
          success: true,
          reason: "Regenerated mapping is correct"
        },
        messages: []
      });

      const result = await executeTransform({
        datastore: mockDataStore,
        fromCache: false,
        input: { endpoint: inputWithMapping },
        data: samplePayload,
        metadata: { orgId: testOrgId }
        // No options provided - should default to self-healing enabled
      });

      expect(result.config.responseMapping).toBeDefined();
      expect(LanguageModel.generateObject).toHaveBeenCalledTimes(2);
    });
  });
});