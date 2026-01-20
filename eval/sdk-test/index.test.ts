import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SuperglueClient, System, Workflow, WorkflowResult, SystemList } from '@superglue/client';

const SYSTEM_ID = 'github-test';
let client: SuperglueClient;
let toolId: string | null = null;

beforeAll(() => {
  const endpoint = process.env.GRAPHQL_ENDPOINT || 'http://localhost:3000';
  const apiKey = process.env.AUTH_TOKEN;
  const githubToken = process.env.GITHUB_API_TOKEN;

  if (!apiKey) {
    throw new Error('AUTH_TOKEN environment variable is required');
  }
  if (!githubToken) {
    throw new Error('GITHUB_API_TOKEN environment variable is required');
  }
  
  client = new SuperglueClient({ endpoint, apiKey });
});

afterAll(async () => {
  if (client) {
    if (toolId) {
      await client.deleteWorkflow(toolId).catch(() => {});
    }
    await client.deleteSystem(SYSTEM_ID).catch(() => {});
  }
});

describe('Superglue SDK System Tests', () => {
  it('should create GitHub system', async () => {
    const githubToken = process.env.GITHUB_API_TOKEN!;
    
    const result = await client.upsertSystem(SYSTEM_ID, {
      name: 'GitHub',
      urlHost: 'https://api.github.com',
      urlPath: '',
      documentationUrl: 'https://docs.github.com/en/rest',
      credentials: {
        api_token: githubToken
      },
      documentationKeywords: ['repositories', 'issues', 'pull_requests', 'commits']
    });

    const system: System = result;
    expect(system.id).toBe(SYSTEM_ID);
    expect(system.name).toBe('GitHub');
  });

  it('should list systems and find created one', async () => {
    const result = await client.listSystems(50, 0);
    
    const systemsList: SystemList = result;
    const foundSystem = systemsList.items.find(i => i.id === SYSTEM_ID);

    expect(foundSystem).toBeDefined();
    expect(foundSystem?.id).toBe(SYSTEM_ID);
    expect(foundSystem?.name).toBe('GitHub');
  });

  it('should update system', async () => {
    const result = await client.upsertSystem(SYSTEM_ID, {
      name: 'GitHub Updated',
      documentationKeywords: ['repositories', 'issues', 'pull_requests', 'commits', 'branches']
    });

    const system: System = result;
    expect(system.name).toBe('GitHub Updated');
  });

  it('should build a workflow', async () => {
    const result = await client.buildWorkflow({
      instruction: 'List all repositories for the authenticated user. I want the final output to be a JSON object with the following structure: { repositories: [{id: number, name: string, isPublic: boolean}] }.',
      systemIds: [SYSTEM_ID],
      payload: {},
      save: true
    });

    const workflow: Workflow = result;
    toolId = workflow.id;
    expect(toolId).toBeDefined();
    expect(workflow.id).toBeTruthy();
  });

  it('should execute the workflow', async () => {
    expect(toolId).toBeDefined();
    
    const githubToken = process.env.GITHUB_API_TOKEN!;

    const result = await client.executeWorkflow({
      id: toolId!,
      payload: {},
      credentials: {
        [`${SYSTEM_ID}_api_token`]: githubToken
      }
    });

    const workflowResult: WorkflowResult = result;
    expect(workflowResult.success).toBe(true);
    expect(workflowResult.data).toBeDefined();
  });

  it('should verify system modifications', async () => {
    const result = await client.listSystems(50, 0);
    
    const systemsList: SystemList = result;
    const verifiedSystem = systemsList.items.find(i => i.id === SYSTEM_ID);

    expect(verifiedSystem?.name).toBe('GitHub Updated');
  });

  it('should list workflows and find created one', async () => {
    const result = await client.listWorkflows(50, 0);
    
    const workflowsList: { items: Workflow[]; total: number } = result;
    const foundWorkflow = workflowsList.items.find(t => t.id === toolId);

    expect(foundWorkflow).toBeDefined();
    expect(foundWorkflow?.id).toBe(toolId);
    expect(foundWorkflow?.instruction).toBeTruthy();
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
    const systemsResult = await client.listSystems(50, 0);
    const systemsList: SystemList = systemsResult;
    const stillExists = systemsList.items.find(i => i.id === SYSTEM_ID);

    expect(stillExists).toBeUndefined();

    const workflowsResult = await client.listWorkflows(50, 0);
    const workflowsList: { items: Workflow[]; total: number } = workflowsResult;
    const toolStillExists = workflowsList.items.find(t => t.id === toolId);

    expect(toolStillExists).toBeUndefined();
  });
});

