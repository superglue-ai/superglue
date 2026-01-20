import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SuperglueClient } from '@superglue/client';

const SYSTEM_ID = 'github-test';
let client: SuperglueClient;
let toolId: string | null = null;

const endpoint = process.env.GRAPHQL_ENDPOINT || 'http://localhost:3000';
const apiKey = process.env.AUTH_TOKEN;
const githubToken = process.env.GITHUB_API_TOKEN;

beforeAll(() => {
  if (!apiKey) {
    throw new Error('AUTH_TOKEN environment variable is required');
  }
  if (!githubToken) {
    throw new Error('GITHUB_API_TOKEN environment variable is required');
  }
  client = new SuperglueClient({ endpoint, apiKey });
});

afterAll(async () => {
  if (toolId) {
    await client.deleteWorkflow(toolId).catch(() => {});
  }
  await client.deleteSystem(SYSTEM_ID).catch(() => {});
});

describe('Superglue SDK Integration Tests', () => {
  it('should create GitHub system', async () => {
    const system = await client.upsertSystem(SYSTEM_ID, {
      name: 'GitHub',
      urlHost: 'https://api.github.com',
      urlPath: '',
      documentationUrl: 'https://docs.github.com/en/rest',
      credentials: {
        api_token: githubToken
      },
      documentationKeywords: ['repositories', 'issues', 'pull_requests', 'commits']
    });

    expect(system.id).toBe(SYSTEM_ID);
    expect(system.name).toBe('GitHub');
  });

  it('should list systems and find created one', async () => {
    const systemsList = await client.listSystems(50, 0);
    const foundSystem = systemsList.items.find(s => s.id === SYSTEM_ID);

    expect(foundSystem).toBeDefined();
    expect(foundSystem?.id).toBe(SYSTEM_ID);
    expect(foundSystem?.name).toBe('GitHub');
  });

  it('should update system', async () => {
    const updatedSystem = await client.upsertSystem(SYSTEM_ID, {
      name: 'GitHub Updated',
      documentationKeywords: ['repositories', 'issues', 'pull_requests', 'commits', 'branches']
    });

    expect(updatedSystem.name).toBe('GitHub Updated');
  });

  it('should build a workflow', async () => {
    const tool = await client.buildWorkflow({
      instruction: 'List all repositories for the authenticated user. I want the final output to be a JSON object with the following structure: { repositories: [{id: number, name: string, isPublic: boolean}] }.',
      systemIds: [SYSTEM_ID],
      payload: {},
      save: true
    });

    toolId = tool.id;
    expect(toolId).toBeDefined();
    expect(tool.id).toBeTruthy();
  });

  it('should execute the workflow', async () => {
    expect(toolId).toBeDefined();

    const result = await client.executeWorkflow({
      id: toolId!,
      payload: {},
      credentials: {
        [`${SYSTEM_ID}_api_token`]: githubToken!
      }
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should verify system modifications', async () => {
    const verifyList = await client.listSystems(50, 0);
    const verifiedSystem = verifyList.items.find(i => i.id === SYSTEM_ID);

    expect(verifiedSystem?.name).toBe('GitHub Updated');
  });

  it('should list workflows and find created one', async () => {
    const toolsList = await client.listWorkflows(50, 0);
    const foundTool = toolsList.items.find(t => t.id === toolId);

    expect(foundTool).toBeDefined();
    expect(foundTool?.id).toBe(toolId);
    expect(foundTool?.instruction).toBeTruthy();
  });

  it('should delete workflow', async () => {
    expect(toolId).toBeDefined();

    const deleted = await client.deleteWorkflow(toolId!);
    expect(deleted).toBe(true);
    
    toolId = null;
  });

  it('should delete system', async () => {
    const deleted = await client.deleteSystem(SYSTEM_ID);
    expect(deleted).toBe(true);
  });

  it('should verify cleanup', async () => {
    const finalSystemsList = await client.listSystems(50, 0);
    const stillExists = finalSystemsList.items.find(i => i.id === SYSTEM_ID);

    expect(stillExists).toBeUndefined();

    const finalToolsList = await client.listWorkflows(50, 0);
    const toolStillExists = finalToolsList.items.find(t => t.id === toolId);

    expect(toolStillExists).toBeUndefined();
  });
});

