import { TransformInput } from '@superglue/shared';
import dotenv from 'dotenv';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyJsonataWithValidation } from './tools.js';
import { generateMapping, prepareTransform } from './transform.js';

// Define mockOpenAI at the top level
const mockOpenAI = {
  chat: {
    completions: {
      create: vi.fn()
    }
  }
};
vi.mock('openai', () => ({
    default: class {
      constructor() {
        return mockOpenAI;
      }
    }
  }));          

describe('transform utils', () => {  
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    dotenv.config();
    // Reset the mock implementation
    mockOpenAI.chat.completions.create.mockReset();
  });

  describe('prepareTransform', () => {
    const testOrgId = 'test-org';
    const sampleInput: TransformInput = {
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
        getTransformConfigFromRequest: vi.fn(),
      } as any;      
      const input = { ...sampleInput, responseSchema: {} };
      const result = await prepareTransform(mockDataStore, false, input, {}, { orgId: testOrgId });
      expect(result).toBeNull();
    });

    it('should return cached config if fromCache is true and cache exists', async () => {
        let mockDataStore = {
            getTransformConfigFromRequest: vi.fn(),
          } as any;          
      const cachedConfig = {
        id: 'cached-id',
        responseMapping: 'cached-mapping',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      (mockDataStore.getTransformConfigFromRequest as any).mockResolvedValue(cachedConfig);
      
      const result = await prepareTransform(mockDataStore, true, sampleInput, { product: { name: 'test' } }, { orgId: testOrgId });
      
      expect(result).toEqual({
        ...cachedConfig,
        ...sampleInput
      });
    });

    it('should create new config if responseMapping is provided', async () => {
      let mockDataStore = {
        getTransformConfigFromRequest: vi.fn(),
      } as any;          
      const input = {
        ...sampleInput,
        responseMapping: 'test-mapping'
      };
      
      const result = await prepareTransform(mockDataStore, false, input, { product: { name: 'test' } }, { orgId: testOrgId });
      
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
            getTransformConfigFromRequest: vi.fn(),
          } as any;      
          mockOpenAI.chat.completions.create.mockResolvedValueOnce({
            choices: [{
              message: {
                content: JSON.stringify({
                  jsonata: '{"name": user.firstName & " " & user.lastName}',
                  confidence: 95,
                  confidence_reasoning: 'Direct field mapping available'
                })
              }
            }]
          });    
      const transform = await prepareTransform(mockDataStore, false, sampleInput, samplePayload, { orgId: testOrgId });
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

      mockOpenAI.chat.completions.create.mockReset();
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
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              jsonata: '{"name": user.firstName & " " & user.lastName}',
              confidence: 95,
              confidence_reasoning: 'Direct field mapping available'
            })
          }
        }]
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
    }, 30000); // Increased timeout for real API call

    it('should retry on failure', async () => {
      let attempts = 0;
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(attempts++ === 0 ? new Error('API Error') : null);
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              jsonata: '{"name": user.firstName & " " & user.lastName}',
              confidence: 95,
              confidence_reasoning: 'Direct field mapping available'
            })
          }
        }]
      });
      const result = await generateMapping(sampleSchema, samplePayload, 'test-instruction', {});
      expect(result).toBeDefined();
      expect(attempts).toBe(1);
    });

    it('should return null after max retries', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await generateMapping(sampleSchema, samplePayload, 'test-instruction', {});
      expect(result).toBeNull();
    });
  });
});