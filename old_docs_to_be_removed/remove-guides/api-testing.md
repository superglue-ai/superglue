---
title: "API Schema Testing Guide"
description: "Use superglue's API endpoints to programmatically test and validate API schema designs."
---

This guide shows how to integrate schema testing into your development workflow using direct API calls.

## **Overview**

The superglue API provides GraphQL endpoints for creating integrations, building workflows, and executing schema tests. This allows you to automate schema validation and integrate testing into your CI/CD pipeline.

## **Authentication**

All API requests require a bearer token in the Authorization header:

```http
Authorization: Bearer YOUR_AUTH_TOKEN
```

## **Base Endpoint**

```
https://graphql.superglue.cloud
```

## **Core Schema Testing Workflow**

### **1. Create Test Integrations**

First, set up integrations pointing to different versions of your API using the `upsertIntegration` mutation:

```graphql
mutation CreateTestIntegration {
  upsertIntegration(
    id: "products-api-v1"
    input: {
      id: "products-api-v1"
      name: "Products API v1 - Nested Schema"
      urlHost: "https://api-staging.mycompany.com"
      urlPath: "/v1/products"
      credentials: {
        api_key: "<<products-api-v1_api_key>>"
      }
      documentation: "Products API with nested category structure"
    }
  ) {
    id
    name
    urlHost
    documentationPending
  }
}
```

Create a second integration for comparison:

```graphql
mutation CreateTestIntegrationV2 {
  upsertIntegration(
    id: "products-api-v2"
    input: {
      id: "products-api-v2"
      name: "Products API v2 - Flat Schema"
      urlHost: "https://api-staging.mycompany.com"
      urlPath: "/v2/products"
      credentials: {
        api_key: "<<products-api-v2_api_key>>"
      }
      documentation: "Products API with flat structure"
    }
  ) {
    id
    name
    urlHost
    documentationPending
  }
}
```

### **2. Build and Test Workflows**

Use the `buildAndRunWorkflow` mutation to create workflows that test your schemas:

```graphql
mutation TestSchemaV1 {
  buildAndRunWorkflow(
    input: {
      instruction: "Get all products with categories and sync to inventory management system"
      integrationIds: ["products-api-v1", "inventory-system"]
      responseSchema: {
        type: "object"
        properties: {
          syncedProducts: { type: "number" }
          categories: { type: "array" }
          errors: { type: "array" }
        }
      }
    }
  ) {
    result {
      ... on WorkflowResult {
        success
        data
        error
        workflow {
          id
          steps {
            id
            instruction
            executionMode
            responseMapping
          }
          finalTransform
        }
        executionTime
      }
    }
  }
}
```

### **3. Compare Schema Performance**

Execute the same test against different schema versions:

```graphql
mutation TestSchemaV2 {
  buildAndRunWorkflow(
    input: {
      instruction: "Get all products with categories and sync to inventory management system"
      integrationIds: ["products-api-v2", "inventory-system"]
      responseSchema: {
        type: "object"
        properties: {
          syncedProducts: { type: "number" }
          categories: { type: "array" }
          errors: { type: "array" }
        }
      }
    }
  ) {
    result {
      ... on WorkflowResult {
        success
        data
        error
        workflow {
          id
          steps {
            id
            instruction
            executionMode
            responseMapping
          }
          finalTransform
        }
        executionTime
      }
    }
  }
}
```

### **4. Save Successful Workflows**

Save workflows that pass testing for future use:

```graphql
mutation SaveWorkflow {
  upsertWorkflow(
    id: "product-sync-v1"
    input: {
      id: "product-sync-v1"
      steps: [
        {
          id: "getProducts"
          integrationId: "products-api-v1"
          instruction: "Get all products with categories"
          executionMode: DIRECT
          responseMapping: "$"
        }
        {
          id: "syncInventory"
          integrationId: "inventory-system"
          instruction: "Sync products to inventory management"
          executionMode: LOOP
          responseMapping: "$"
        }
      ]
      integrationIds: ["products-api-v1", "inventory-system"]
      instruction: "Get all products with categories and sync to inventory management system"
      finalTransform: "$.syncInventory[].{\"productId\": product_id, \"status\": \"synced\"}"
    }
  ) {
    id
    instruction
    createdAt
    updatedAt
  }
}
```

## **Complete Schema Testing Example**

Here's a complete Node.js example that tests two schema versions and compares their performance:

```javascript
const SUPERGLUE_ENDPOINT = 'https://graphql.superglue.cloud';
const API_KEY = 'your_api_key_here';

async function makeGraphQLRequest(query, variables = {}) {
  const response = await fetch(SUPERGLUE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables
    })
  });

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL Error: ${result.errors.map(e => e.message).join(', ')}`);
  }

  return result.data;
}

async function createTestIntegration(id, name, urlPath, description) {
  const query = `
    mutation CreateTestIntegration($id: ID!, $input: IntegrationInput!) {
      upsertIntegration(id: $id, input: $input) {
        id
        name
        urlHost
        documentationPending
      }
    }
  `;

  const variables = {
    id,
    input: {
      id,
      name,
      urlHost: "https://api-staging.mycompany.com",
      urlPath,
      credentials: {
        api_key: `<<${id}_api_key>>`
      },
      documentation: description
    }
  };

  return await makeGraphQLRequest(query, variables);
}

async function testSchemaWorkflow(integrationId, testName) {
  const query = `
    mutation TestSchemaWorkflow($input: WorkflowInput!) {
      buildAndRunWorkflow(input: $input) {
        result {
          ... on WorkflowResult {
            success
            data
            error
            workflow {
              id
              steps {
                id
                instruction
                executionMode
                responseMapping
              }
              finalTransform
            }
            executionTime
          }
        }
      }
    }
  `;

  const variables = {
    input: {
      instruction: "Get all products with categories and sync to inventory management system",
      integrationIds: [integrationId, "inventory-system"],
      responseSchema: {
        type: "object",
        properties: {
          syncedProducts: { type: "number" },
          categories: { type: "array" },
          errors: { type: "array" }
        }
      }
    }
  };

  const result = await makeGraphQLRequest(query, variables);

  return {
    testName,
    success: result.buildAndRunWorkflow.result.success,
    stepCount: result.buildAndRunWorkflow.result.workflow?.steps.length || 0,
    executionTime: result.buildAndRunWorkflow.result.executionTime || 0,
    error: result.buildAndRunWorkflow.result.error
  };
}

async function runSchemaComparison() {
  console.log('🚀 Starting schema comparison test...\n');

  try {
    // Step 1: Create test integrations
    console.log('📝 Creating test integrations...');

    await createTestIntegration(
      'products-api-v1',
      'Products API v1 - Nested Schema',
      '/v1/products',
      'Products API with nested category structure'
    );

    await createTestIntegration(
      'products-api-v2',
      'Products API v2 - Flat Schema',
      '/v2/products',
      'Products API with flat structure'
    );

    console.log('✅ Test integrations created\n');

    // Step 2: Test both schemas
    console.log('🧪 Testing schema versions...');

    const v1Result = await testSchemaWorkflow('products-api-v1', 'Nested Schema (v1)');
    const v2Result = await testSchemaWorkflow('products-api-v2', 'Flat Schema (v2)');

    // Step 3: Compare results
    console.log('📊 Schema Comparison Results:\n');

    console.log(`${v1Result.testName}:`);
    console.log(`  Success: ${v1Result.success ? '✅' : '❌'}`);
    console.log(`  Steps: ${v1Result.stepCount}`);
    console.log(`  Execution Time: ${v1Result.executionTime}ms`);
    if (v1Result.error) console.log(`  Error: ${v1Result.error}`);

    console.log(`\n${v2Result.testName}:`);
    console.log(`  Success: ${v2Result.success ? '✅' : '❌'}`);
    console.log(`  Steps: ${v2Result.stepCount}`);
    console.log(`  Execution Time: ${v2Result.executionTime}ms`);
    if (v2Result.error) console.log(`  Error: ${v2Result.error}`);

    // Step 4: Determine winner
    console.log('\n🏆 Analysis:');

    if (v1Result.success && v2Result.success) {
      const v1Score = v1Result.stepCount;
      const v2Score = v2Result.stepCount;

      if (v1Score < v2Score) {
        console.log(`Winner: ${v1Result.testName} (${v1Score} steps vs ${v2Score} steps)`);
      } else if (v2Score < v1Score) {
        console.log(`Winner: ${v2Result.testName} (${v2Score} steps vs ${v1Score} steps)`);
      } else {
        console.log('Tie: Both schemas have equal complexity');
      }
    } else {
      console.log('Some tests failed - review errors above');
    }

  } catch (error) {
    console.error('❌ Schema comparison failed:', error.message);
  }
}

// Run the comparison
runSchemaComparison();
```

## **Testing Breaking Changes**

Test existing workflows against new API versions to detect breaking changes:

```graphql
query ListExistingWorkflows {
  listWorkflows(limit: 100) {
    items {
      id
      instruction
      integrationIds
      steps {
        id
        integrationId
        instruction
      }
    }
  }
}
```

Then execute each workflow with updated integration IDs:

```graphql
mutation TestBreakingChanges($workflowId: ID!, $payload: JSON, $credentials: JSON) {
  executeWorkflow(
    input: { id: $workflowId }
    payload: $payload
    credentials: $credentials
  ) {
    result {
      ... on WorkflowResult {
        success
        data
        error
      }
    }
  }
}
```

## **Advanced Testing Patterns**

### **Batch Testing Multiple Use Cases**

```javascript
const testCases = [
  {
    name: "Product Catalog Sync",
    instruction: "Get all products with categories and sync to inventory system",
    expectedOutput: {
      type: "object",
      properties: {
        syncedProducts: { type: "number" },
        categories: { type: "array" }
      }
    }
  },
  {
    name: "Price Update Workflow",
    instruction: "Update product prices from external pricing service",
    expectedOutput: {
      type: "object",
      properties: {
        updatedProducts: { type: "number" },
        errors: { type: "array" }
      }
    }
  },
  {
    name: "Inventory Reconciliation",
    instruction: "Compare inventory levels across systems and identify discrepancies",
    expectedOutput: {
      type: "object",
      properties: {
        discrepancies: { type: "array" },
        totalChecked: { type: "number" }
      }
    }
  }
];

async function runBatchTests(integrationId) {
  const results = [];

  for (const testCase of testCases) {
    try {
      const result = await testSchemaWorkflow(integrationId, testCase.name);
      results.push(result);
    } catch (error) {
      results.push({
        testName: testCase.name,
        success: false,
        error: error.message
      });
    }
  }

  return results;
}
```

### **Performance Benchmarking**

```javascript
async function benchmarkSchema(integrationId, iterations = 5) {
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    const result = await testSchemaWorkflow(integrationId, `Benchmark ${i + 1}`);
    const end = Date.now();

    times.push(end - start);
  }

  return {
    average: times.reduce((sum, time) => sum + time, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    times
  };
}
```

## **CI/CD Integration**

### **GitHub Actions Example**

```yaml
name: API Schema Testing
on:
  pull_request:
    paths: ['api/**', 'schema/**']

jobs:
  test-schemas:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run schema tests
        run: node schema-test.js
        env:
          SUPERGLUE_API_KEY: ${{ secrets.SUPERGLUE_API_KEY }}
          API_STAGING_URL: ${{ secrets.API_STAGING_URL }}

      - name: Post results to PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('test-results.json', 'utf8'));

            const comment = `## 🧪 Schema Test Results

            ${results.map(r => `- **${r.testName}**: ${r.success ? '✅' : '❌'} (${r.stepCount} steps)`).join('\n')}

            ${results.some(r => !r.success) ? '⚠️ Some tests failed - review before merging' : '✅ All tests passed'}`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

## **Error Handling**

Always include proper error handling in your schema tests:

```javascript
async function safeTestWorkflow(integrationId, testName) {
  try {
    const result = await testSchemaWorkflow(integrationId, testName);
    return result;
  } catch (error) {
    console.error(`Test failed for ${testName}:`, error.message);
    return {
      testName,
      success: false,
      error: error.message,
      stepCount: 0,
      executionTime: 0
    };
  }
}
```

## **Best Practices**

1. **Test Early and Often**: Run schema tests on every API change
2. **Use Realistic Data**: Test with production-like data volumes and structures
3. **Automate in CI/CD**: Include schema testing in your deployment pipeline
4. **Monitor Performance**: Track how schema changes affect integration complexity
5. **Document Results**: Keep a record of schema decisions and their test outcomes

## **Rate Limits and Quotas**

Be aware of API rate limits when running automated tests:

- Maximum 100 requests per minute per API key
- Consider adding delays between batch operations
- Use exponential backoff for retries

```javascript
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTestsWithRateLimit(tests) {
  const results = [];

  for (const test of tests) {
    const result = await safeTestWorkflow(test.integrationId, test.name);
    results.push(result);

    // Rate limit: wait 1 second between tests
    await sleep(1000);
  }

  return results;
}
```

## **Next Steps**

1. [<u>Explore the full GraphQL schema</u>](https://claude.ai/docs/api/graphql-schema)
2. [<u>Learn about workflow building</u>](https://claude.ai/docs/workflows)
3. [<u>Use superglue via MCP</u>](https://claude.ai/docs/integrations)
4. [<u>Join our community</u>](https://claude.ai/discord) for support and examples
