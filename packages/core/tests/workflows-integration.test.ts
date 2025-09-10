#!/usr/bin/env tsx

/**
 * Integration tests for Workflows REST API endpoints
 * 
 * These tests run against a real running API server and test the complete
 * workflow from HTTP request to database operations. They verify that the
 * API endpoints work correctly with real data and integrations.
 */

import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

// Configuration
const BASE_URL = 'http://localhost:3002/v1';
const API_KEY = process.env.AUTH_TOKEN;

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Helper function to make API requests
async function apiRequest(method: string, endpoint: string, data?: any): Promise<{ status: number; body: any }> {
  const url = `${BASE_URL}${endpoint}`;
  
  console.log(`\n${colors.blue}🔍 ${method} ${url}${colors.reset}`);
  
  if (data) {
    console.log(`${colors.yellow}📤 Request body:${colors.reset}`);
    console.log(JSON.stringify(data, null, 2));
  }
  
  let curlCommand = `curl -s -w "\\n%{http_code}" -X ${method} -H "Authorization: Bearer ${API_KEY}"`;
  
  if (data) {
    curlCommand += ` -H "Content-Type: application/json" -d '${JSON.stringify(data)}'`;
  }
  
  curlCommand += ` "${url}"`;
  
  try {
    const response = execSync(curlCommand, { encoding: 'utf8' });
    const lines = response.trim().split('\n');
    const statusCode = parseInt(lines[lines.length - 1]);
    const body = lines.slice(0, -1).join('\n');
    
    console.log(`${colors.blue}📊 Status: ${statusCode}${colors.reset}`);
    console.log(`${colors.yellow}📥 Response:${colors.reset}`);
    
    try {
      const parsedBody = JSON.parse(body);
      const prettyBody = JSON.stringify(parsedBody, null, 2);
      console.log(prettyBody.slice(0, 2000));
      return { status: statusCode, body: parsedBody };
    } catch {
      console.log(body);
      return { status: statusCode, body };
    }
  } catch (error) {
    console.error(`${colors.red}❌ Request failed: ${error}${colors.reset}`);
    return { status: 0, body: null };
  }
}

// Test data
const testWorkflow = {
  steps: [
    {
      id: 'step1',
      apiConfig: {
        id: 'api-config-1',
        urlHost: 'https://api.example.com',
        urlPath: '/data',
        instruction: 'Get data from example API',
      },
      integrationId: 'integration-1',
      executionMode: 'DIRECT',
      loopSelector: undefined,
      loopMaxIters: 10,
      inputMapping: undefined,
      responseMapping: undefined
    }
  ],
  integrationIds: ['integration-1'],
  finalTransform: undefined,
  inputSchema: undefined,
  responseSchema: undefined,
  instruction: 'A test workflow for API testing',
  originalResponseSchema: undefined
};

// Test functions
async function testListWorkflows(): Promise<boolean> {
  console.log(`\n${colors.yellow}🧪 Testing GET /workflows (list workflows)${colors.reset}`);
  
  const response = await apiRequest('GET', '/workflows?limit=5&offset=0');
  
  if (response.status === 200) {
    console.log(`${colors.green}✅ List workflows: SUCCESS${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}❌ List workflows: FAILED${colors.reset}`);
    return false;
  }
}

async function testCreateWorkflow(): Promise<boolean> {
  console.log(`\n${colors.yellow}🧪 Testing POST /workflows (create workflow)${colors.reset}`);
  
  const creatWorkflow = {
    id: 'test-workflow-id',
    version: '2',
    data: testWorkflow
  };
  const response = await apiRequest('POST', '/workflows', creatWorkflow);
  
  if (response.status === 201) {
    console.log(`${colors.green}✅ Create workflow: SUCCESS${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}❌ Create workflow: FAILED${colors.reset}`);
    return false;
  }
}

async function testGetWorkflow(): Promise<boolean> {
  console.log(`\n${colors.yellow}🧪 Testing GET /workflows/{id} (get workflow)${colors.reset}`);
  
  const response = await apiRequest('GET', '/workflows/test-workflow-id');
  
  if (response.status === 200) {
    console.log(`${colors.green}✅ Get workflow: SUCCESS${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}❌ Get workflow: FAILED${colors.reset}`);
    return false;
  }
}

async function testUpdateWorkflow(): Promise<boolean> {
  console.log(`\n${colors.yellow}🧪 Testing PUT /workflows/{id} (update workflow)${colors.reset}`);
  
  const updatedWorkflow = {
    version: '3',
    data: {
      ...testWorkflow,
      instruction: 'Updated test workflow for API testing'
    }
  };
  
  const response = await apiRequest('PUT', '/workflows/test-workflow-id', updatedWorkflow);
  
  if (response.status === 200) {
    console.log(`${colors.green}✅ Update workflow: SUCCESS${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}❌ Update workflow: FAILED${colors.reset}`);
    return false;
  }
}

async function testDeleteWorkflow(): Promise<boolean> {
  console.log(`\n${colors.yellow}🧪 Testing DELETE /workflows/{id} (delete workflow)${colors.reset}`);
  
  const response = await apiRequest('DELETE', '/workflows/test-workflow-id');
  
  if (response.status === 204) {
    console.log(`${colors.green}✅ Delete workflow: SUCCESS${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}❌ Delete workflow: FAILED${colors.reset}`);
    return false;
  }
}

async function test404(): Promise<boolean> {
  console.log(`\n${colors.yellow}🧪 Testing GET /workflows/nonexistent (404 test)${colors.reset}`);
  
  const response = await apiRequest('GET', '/workflows/nonexistent');
  
  if (response.status === 404) {
    console.log(`${colors.green}✅ 404 test: SUCCESS${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}❌ 404 test: FAILED${colors.reset}`);
    return false;
  }
}

async function testValidationErrors(): Promise<boolean> {
  console.log(`\n${colors.yellow}🧪 Testing POST /workflows (validation errors)${colors.reset}`);
  
  const invalidWorkflow = {
    // Missing required fields
    name: '',
    steps: []
  };
  
  const response = await apiRequest('POST', '/workflows', invalidWorkflow);
  
  if (response.status === 400) {
    console.log(`${colors.green}✅ Validation errors test: SUCCESS${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}❌ Validation errors test: FAILED${colors.reset}`);
    return false;
  }
}

async function testBuildWorkflow(): Promise<boolean> {
  console.log(`\n${colors.yellow}🧪 Testing POST /workflows/build (build workflow)${colors.reset}`);
  
  const startTime = Date.now();
  
  const buildRequest = {
    instruction: "Get all repositories for a specific GitHub user",
    integrationIds: ["github"],
    payload: {},
    responseSchema: {}
  };
  
  const response = await apiRequest('POST', '/workflows/build', buildRequest);
  const buildTime = Date.now() - startTime;
  
  console.log(`${colors.blue}⏱️ Build time: ${buildTime}ms${colors.reset}`);
  
  if (response.status === 200) {
    const workflow = response.body;
    
    // Structure validation
    if (!workflow.id) {
      console.log(`${colors.red}❌ Build workflow: FAILED - Missing workflow ID${colors.reset}`);
      return false;
    }
    
    if (!workflow.steps || !Array.isArray(workflow.steps)) {
      console.log(`${colors.red}❌ Build workflow: FAILED - Missing or invalid steps${colors.reset}`);
      return false;
    }
    
    if (workflow.steps.length === 0) {
      console.log(`${colors.red}❌ Build workflow: FAILED - No steps generated${colors.reset}`);
      return false;
    }
    
    // Check if at least one step uses GitHub integration
    const hasGitHubStep = workflow.steps.some((step: any) => 
      step.integrationId === 'github' || 
      (workflow.integrationIds && workflow.integrationIds.includes('github'))
    );
    
    if (!hasGitHubStep) {
      console.log(`${colors.red}❌ Build workflow: FAILED - No GitHub integration found in steps${colors.reset}`);
      return false;
    }
    
    // Check step structure
    const firstStep = workflow.steps[0];
    if (!firstStep.id || !firstStep.apiConfig) {
      console.log(`${colors.red}❌ Build workflow: FAILED - Invalid step structure${colors.reset}`);
      return false;
    }
    
    // Check if instruction is preserved
    if (!workflow.instruction || !workflow.instruction.includes('repositories')) {
      console.log(`${colors.red}❌ Build workflow: FAILED - Instruction not properly set${colors.reset}`);
      return false;
    }
    
    console.log(`${colors.green}✅ Build workflow: SUCCESS${colors.reset}`);
    console.log(`${colors.blue}📋 Generated ${workflow.steps.length} step(s)${colors.reset}`);
    console.log(`${colors.blue}🔗 Workflow ID: ${workflow.id}${colors.reset}`);
    console.log(`${colors.blue}📝 Instruction: ${workflow.instruction}${colors.reset}`);
    
    return true;
  } else {
    console.log(`${colors.red}❌ Build workflow: FAILED - Status ${response.status}${colors.reset}`);
    if (response.body && response.body.message) {
      console.log(`${colors.red}Error: ${response.body.message}${colors.reset}`);
    }
    return false;
  }
}

// Main test runner
async function main() {
  console.log(`${colors.blue}🚀 Starting REST API Tests${colors.reset}`);
  console.log(`${colors.blue}Base URL: ${BASE_URL}${colors.reset}`);
  console.log(`${colors.blue}API Key: ${API_KEY.substring(0, 8)}...${colors.reset}`);
  
  let passed = 0;
  let total = 0;
  
  // Run tests
  if (await testListWorkflows()) passed++;
  total++;
  
  if (await testCreateWorkflow()) passed++;
  total++;
  
  if (await testGetWorkflow()) passed++;
  total++;
  
  if (await testUpdateWorkflow()) passed++;
  total++;
  
  if (await testDeleteWorkflow()) passed++;
  total++;
  
  if (await test404()) passed++;
  total++;
  
  if (await testValidationErrors()) passed++;
  total++;
  
  if (await testBuildWorkflow()) passed++;
  total++;
  
  // Summary
  console.log(`\n${colors.blue}📊 Test Summary${colors.reset}`);
  console.log(`${colors.blue}Passed: ${passed}/${total}${colors.reset}`);
  
  if (passed === total) {
    console.log(`${colors.green}🎉 All tests passed!${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`${colors.red}❌ Some tests failed${colors.reset}`);
    process.exit(1);
  }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}