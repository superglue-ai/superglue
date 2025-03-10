import type { DataStore } from '@superglue/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { DataStoreFactory, EnvVarManager, MockServerFactory } from './test-utils.js';

describe('Tenant Info Basic Tests', () => {
  // Create data store factory
  const dataStoreFactory = new DataStoreFactory('./.test-tenant-data');
  dataStoreFactory.setupHooks();
  
  // Test all datastore implementations
  for (const { name, instance } of dataStoreFactory.init()) {
    describe(`${name} Tenant Info Tests`, () => {
      // Reset before each test to ensure clean state
      beforeEach(async () => {
        await instance.setTenantInfo(null, false);
      });

      it('should return default tenant info when not set', async () => {
        const tenantInfo = await instance.getTenantInfo();
        expect(tenantInfo).toEqual({
          email: null,
          emailEntrySkipped: false
        });
      });

      it('should properly set email address', async () => {
        const testEmail = 'test@example.com';
        await instance.setTenantInfo(testEmail, undefined);
        
        const tenantInfo = await instance.getTenantInfo();
        expect(tenantInfo).toEqual({
          email: testEmail,
          emailEntrySkipped: false // should retain existing value
        });
      });

      it('should properly set emailEntrySkipped to true', async () => {
        await instance.setTenantInfo(undefined, true);
        
        const tenantInfo = await instance.getTenantInfo();
        expect(tenantInfo).toEqual({
          email: null, // should retain existing value
          emailEntrySkipped: true
        });
      });

      it('should properly set emailEntrySkipped to false', async () => {
        // First set it to true
        await instance.setTenantInfo(undefined, true);
        let tenantInfo = await instance.getTenantInfo();
        expect(tenantInfo.emailEntrySkipped).toBe(true);
        
        // Then explicitly set to false
        await instance.setTenantInfo(undefined, false);
        tenantInfo = await instance.getTenantInfo();
        expect(tenantInfo).toEqual({
          email: null,
          emailEntrySkipped: false
        });
      });

      it('should handle both email and emailEntrySkipped being set simultaneously', async () => {
        const testEmail = 'both@example.com';
        await instance.setTenantInfo(testEmail, true);
        
        const tenantInfo = await instance.getTenantInfo();
        expect(tenantInfo).toEqual({
          email: testEmail,
          emailEntrySkipped: true
        });
      });

      it('should preserve values that aren\'t explicitly set', async () => {
        // Set initial values
        const initialEmail = 'preserve@example.com';
        await instance.setTenantInfo(initialEmail, true);
        
        // Update only the email
        const updatedEmail = 'updated@example.com';
        await instance.setTenantInfo(updatedEmail, undefined);
        
        let tenantInfo = await instance.getTenantInfo();
        expect(tenantInfo).toEqual({
          email: updatedEmail,
          emailEntrySkipped: true // should be preserved
        });
        
        // Update only emailEntrySkipped
        await instance.setTenantInfo(undefined, false);
        
        tenantInfo = await instance.getTenantInfo();
        expect(tenantInfo).toEqual({
          email: updatedEmail, // should be preserved
          emailEntrySkipped: false
        });
      });
    });
  };

  describe('TenantInfo Mock GraphQL Resolvers', () => {
    let datastore: DataStore;
    
    beforeEach(async () => {
      datastore = DataStoreFactory.createMemoryStore();
      await datastore.setTenantInfo(null, false);
    });

    it('mocked getTenantInfoResolver should return tenant info from datastore', async () => {
      const testEmail = 'resolver@example.com';
      await datastore.setTenantInfo(testEmail, true);
      
      // Create a mock resolver that mimics the actual getTenantInfoResolver
      const mockGetTenantInfoResolver = async (_: any, __: any, { datastore }: { datastore: DataStore }) => {
        return await datastore.getTenantInfo();
      };
      
      const result = await mockGetTenantInfoResolver(null, null, { datastore });
      expect(result).toEqual({
        email: testEmail,
        emailEntrySkipped: true
      });
    });

    it('mocked setTenantInfoResolver should update tenant info in datastore', async () => {
      // Create a mock resolver that mimics the actual setTenantInfoResolver
      const mockSetTenantInfoResolver = async (
        _: any, 
        { email, emailEntrySkipped }: { email?: string, emailEntrySkipped?: boolean }, 
        { datastore }: { datastore: DataStore }
      ) => {
        await datastore.setTenantInfo(email, emailEntrySkipped);
        return await datastore.getTenantInfo();
      };
      
      const testEmail = 'set-resolver@example.com';
      await mockSetTenantInfoResolver(null, { email: testEmail, emailEntrySkipped: true }, { datastore });
      
      const result = await datastore.getTenantInfo();
      expect(result).toEqual({
        email: testEmail,
        emailEntrySkipped: true
      });
    });

    it('mocked setTenantInfoResolver should preserve unset values', async () => {
      const initialEmail = 'initial@example.com';
      await datastore.setTenantInfo(initialEmail, false);
      
      // Create a mock resolver that mimics the actual setTenantInfoResolver
      const mockSetTenantInfoResolver = async (
        _: any, 
        { email, emailEntrySkipped }: { email?: string, emailEntrySkipped?: boolean }, 
        { datastore }: { datastore: DataStore }
      ) => {
        await datastore.setTenantInfo(email, emailEntrySkipped);
        return await datastore.getTenantInfo();
      };
      
      // Update only emailEntrySkipped
      await mockSetTenantInfoResolver(null, { emailEntrySkipped: true }, { datastore });
      
      const result = await datastore.getTenantInfo();
      expect(result).toEqual({
        email: initialEmail, // should be preserved
        emailEntrySkipped: true
      });
    });

    it('should handle NEXT_PUBLIC_DISABLE_WELCOME_SCREEN env var', async () => {
      const envManager = new EnvVarManager();
      envManager.setupHooks();
      
      envManager.set('NEXT_PUBLIC_DISABLE_WELCOME_SCREEN', 'true');
      
      // Create a mock resolver that mimics the actual getTenantInfoResolver with env var handling
      const mockGetTenantInfoResolver = async (_: any, __: any, { datastore }: { datastore: DataStore }) => {
        if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
          return {
            email: null,
            emailEntrySkipped: true
          };
        }
        return await datastore.getTenantInfo();
      };
      
      // Create a mock resolver that mimics the actual setTenantInfoResolver with env var handling
      const mockSetTenantInfoResolver = async (
        _: any, 
        { email, emailEntrySkipped }: { email?: string, emailEntrySkipped?: boolean }, 
        { datastore }: { datastore: DataStore }
      ) => {
        if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === 'true') {
          return {
            email: null,
            emailEntrySkipped: true
          };
        }
        await datastore.setTenantInfo(email, emailEntrySkipped);
        return await datastore.getTenantInfo();
      };
      
      // Should always return emailEntrySkipped: true regardless of datastore
      const getResult = await mockGetTenantInfoResolver(null, null, { datastore });
      expect(getResult).toEqual({
        email: null,
        emailEntrySkipped: true
      });
      
      // Should always set emailEntrySkipped to true regardless of input
      const setResult = await mockSetTenantInfoResolver(
        null, 
        { email: 'ignored@example.com', emailEntrySkipped: false }, 
        { datastore }
      );
      expect(setResult).toEqual({
        email: null,
        emailEntrySkipped: true
      });
    });
  });

  describe('Welcome Screen HTTP Mock Integration Test', () => {
    const mockServer = new MockServerFactory();
    let datastore: DataStore;
    
    beforeEach(async () => {
      datastore = DataStoreFactory.createMemoryStore();
      await datastore.setTenantInfo(null, false);
      mockServer.getApp()._router.stack = mockServer.getApp()._router.stack.filter(
        (layer: any) => layer.route === undefined
      );
      
      mockServer.addPostRoute('/graphql', async (req, res) => {
        const { query, variables } = req.body;
        
        // Handle getTenantInfo query
        if (query.includes('getTenantInfo')) {
          const info = await datastore.getTenantInfo();
          return res.json({
            data: {
              getTenantInfo: info
            }
          });
        }
        
        // Handle setTenantInfo mutation
        if (query.includes('setTenantInfo')) {
          await datastore.setTenantInfo(
            variables?.email,
            variables?.emailEntrySkipped
          );
          const updatedInfo = await datastore.getTenantInfo();
          return res.json({
            data: {
              setTenantInfo: updatedInfo
            }
          });
        }
        
        // Handle unknown query
        res.status(400).json({ errors: [{ message: 'Unknown query' }] });
      });
    });
    
    // Setup server hooks
    mockServer.setupHooks();
    
    // We'll simulate HTTP requests to the GraphQL endpoint
    // This simulates what happens in welcome/page.tsx and middleware.ts
    
    it('should handle email submission on welcome screen', async () => {
      const testEmail = 'welcome@example.com';
      
      // Simulate the handleSubmit function
      const response = await fetch(`${mockServer.getBaseUrl()}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation SetTenantInfo($email: String!, $emailEntrySkipped: Boolean!) {
              setTenantInfo(email: $email, emailEntrySkipped: $emailEntrySkipped) {
                email
                emailEntrySkipped
              }
            }
          `,
          variables: {
            email: testEmail,
            emailEntrySkipped: false,
          },
        }),
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.data.setTenantInfo).toEqual({
        email: testEmail,
        emailEntrySkipped: false
      });
      
      // Verify datastore was updated
      const tenantInfo = await datastore.getTenantInfo();
      expect(tenantInfo).toEqual({
        email: testEmail,
        emailEntrySkipped: false
      });
    });
    
    it('should handle skip button click on welcome screen', async () => {
      // Simulate the handleSkip function
      const response = await fetch(`${mockServer.getBaseUrl()}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation SetTenantInfo($emailEntrySkipped: Boolean!) {
              setTenantInfo(emailEntrySkipped: $emailEntrySkipped) {
                emailEntrySkipped
              }
            }
          `,
          variables: {
            emailEntrySkipped: true,
          },
        }),
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.data.setTenantInfo.emailEntrySkipped).toBe(true);
      
      // Verify datastore was updated
      const tenantInfo = await datastore.getTenantInfo();
      expect(tenantInfo.emailEntrySkipped).toBe(true);
    });
    
    it('should correctly handle middleware tenant info check', async () => {
      // First set some tenant info
      await datastore.setTenantInfo('middleware@example.com', true);
      
      // Simulate the middleware check
      const response = await fetch(`${mockServer.getBaseUrl()}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetTenantInfo {
              getTenantInfo {
                email
                emailEntrySkipped
              }
            }
          `,
        }),
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json();
      
      // Verify we get back the expected tenant info
      expect(result.data.getTenantInfo).toEqual({
        email: 'middleware@example.com',
        emailEntrySkipped: true
      });
      
      // In the real middleware, this would result in allowing the user to proceed
      // instead of redirecting to the welcome screen
    });
  });
});