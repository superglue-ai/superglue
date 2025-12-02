import 'dotenv/config';
import { SuperglueClient } from '@superglue/client';

console.log('=== SDK Test Starting ===');
console.log('Environment check:');
console.log('- GRAPHQL_ENDPOINT:', process.env.GRAPHQL_ENDPOINT || 'http://localhost:3000');
console.log('- AUTH_TOKEN:', process.env.AUTH_TOKEN ? '✓ Set' : '✗ Not set');
console.log('- GITHUB_API_TOKEN:', process.env.GITHUB_API_TOKEN ? '✓ Set' : '✗ Not set');
console.log('');

const INTEGRATION_ID = 'github-test';
let toolId: string | null = null;

function log(step: number, message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Step ${step}: ${message}`);
}

async function runTests() {
  const endpoint = process.env.GRAPHQL_ENDPOINT || 'http://localhost:3000';
  const apiKey = process.env.AUTH_TOKEN;
  const githubToken = process.env.GITHUB_API_TOKEN;

  if (!apiKey) {
    throw new Error('AUTH_TOKEN environment variable is required');
  }

  if (!githubToken) {
    throw new Error('GITHUB_API_TOKEN environment variable is required');
  }

  log(0, `Initializing SuperglueClient with endpoint: ${endpoint}`);
  const client = new SuperglueClient({ endpoint, apiKey });

  try {
    // Step 1: Create GitHub Integration
    log(1, 'Creating GitHub integration...');
    const integration = await client.upsertIntegration(INTEGRATION_ID, {
      name: 'GitHub',
      urlHost: 'https://api.github.com',
      urlPath: '',
      documentationUrl: 'https://docs.github.com/en/rest',
      credentials: {
        api_token: githubToken
      },
      documentationKeywords: ['repositories', 'issues', 'pull_requests', 'commits']
    });
    log(1, `✓ Created integration: ${integration.id} - ${integration.name}`);

    // Step 2: List Integrations
    log(2, 'Listing integrations...');
    const integrationsList = await client.listIntegrations(50, 0);
    const foundIntegration = integrationsList.items.find(i => i.id === INTEGRATION_ID);
    if (!foundIntegration) {
      throw new Error('GitHub integration not found in list');
    }
    log(2, `✓ Found integration: ${foundIntegration.id} - ${foundIntegration.name}`);

    // Step 3: Modify Integration
    log(3, 'Modifying integration...');
    const updatedIntegration = await client.upsertIntegration(INTEGRATION_ID, {
      name: 'GitHub Updated',
      documentationKeywords: ['repositories', 'issues', 'pull_requests', 'commits', 'branches']
    });
    log(3, `✓ Updated integration name to: ${updatedIntegration.name}`);

    // Step 4: Build Tool
    log(4, 'Building tool...');
    const tool = await client.buildWorkflow({
      instruction: 'List all repositories for the authenticated user. I want the final output to be a JSON object with the following structure: { repositories: [{id: number, name: string, isPublic: boolean}] }.',
      integrationIds: [INTEGRATION_ID],
      payload: {},
      save: true
    });
    toolId = tool.id;
    log(4, `✓ Built tool with ID: ${toolId}`);

    // Step 5: Execute Tool
    log(5, 'Executing tool...');
    const result = await client.executeWorkflow({
      id: toolId,
      payload: {},
      credentials: {
        [`${INTEGRATION_ID}_api_token`]: githubToken
      }
    });
    
    if (!result.success) {
      throw new Error(`Tool execution failed: ${result.error}`);
    }
    log(5, `✓ Tool executed successfully`);
    log(5, `  Result: ${JSON.stringify(result.data, null, 2).substring(0, 200)}...`);

    // Step 6: List Integrations (verify modifications)
    log(6, 'Verifying integration modifications...');
    const verifyList = await client.listIntegrations(50, 0);
    const verifiedIntegration = verifyList.items.find(i => i.id === INTEGRATION_ID);
    if (verifiedIntegration?.name !== 'GitHub Updated') {
      throw new Error(`Integration name not updated. Expected: "GitHub Updated", Got: "${verifiedIntegration?.name}"`);
    }
    log(6, `✓ Verified integration name: ${verifiedIntegration.name}`);

    // Step 7: List Tools
    log(7, 'Listing tools...');
    const toolsList = await client.listWorkflows(50, 0);
    const foundTool = toolsList.items.find(t => t.id === toolId);
    if (!foundTool) {
      throw new Error('Tool not found in list');
    }
    log(7, `✓ Found tool: ${foundTool.id}`);
    log(7, `  Instruction: ${foundTool.instruction?.substring(0, 80)}...`);

    // Step 8: Delete Tool
    log(8, 'Deleting tool...');
    const toolDeleted = await client.deleteWorkflow(toolId);
    if (!toolDeleted) {
      throw new Error('Failed to delete tool');
    }
    log(8, `✓ Deleted tool: ${toolId}`);
    toolId = null;

    // Step 9: Delete Integration
    log(9, 'Deleting integration...');
    const integrationDeleted = await client.deleteIntegration(INTEGRATION_ID);
    if (!integrationDeleted) {
      throw new Error('Failed to delete integration');
    }
    log(9, `✓ Deleted integration: ${INTEGRATION_ID}`);

    // Step 10: Verify Cleanup
    log(10, 'Verifying cleanup...');
    const finalIntegrationsList = await client.listIntegrations(50, 0);
    const stillExists = finalIntegrationsList.items.find(i => i.id === INTEGRATION_ID);
    if (stillExists) {
      throw new Error('Integration still exists after deletion');
    }
    log(10, `✓ Verified integration cleanup`);

    const finalToolsList = await client.listWorkflows(50, 0);
    const toolStillExists = finalToolsList.items.find(t => t.id === toolId);
    if (toolStillExists) {
      throw new Error('Tool still exists after deletion');
    }
    log(10, `✓ Verified tool cleanup`);

    console.log('\n✅ All tests passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

async function cleanup() {
  try {
    const endpoint = process.env.GRAPHQL_ENDPOINT || 'http://localhost:3000';
    const apiKey = process.env.AUTH_TOKEN;
    
    if (!apiKey) return;
    
    const client = new SuperglueClient({ endpoint, apiKey });
    
    if (toolId) {
      console.log(`\nCleaning up tool: ${toolId}`);
      await client.deleteWorkflow(toolId).catch(() => {});
    }
    
    console.log(`\nCleaning up integration: ${INTEGRATION_ID}`);
    await client.deleteIntegration(INTEGRATION_ID).catch(() => {});
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Main execution
runTests()
  .catch(async (error) => {
    await cleanup();
    process.exit(1);
  });

