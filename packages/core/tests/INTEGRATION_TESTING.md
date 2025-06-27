# Integration Testing Framework

## Overview

The integration testing framework is designed to test Superglue's workflow building and execution capabilities across multiple integrations in an automated, repeatable manner.

## Architecture

The framework bypasses the GraphQL layer and directly uses backend functions for improved performance:

1. **Direct Backend Access**: Uses `WorkflowBuilder` and `WorkflowExecutor` directly instead of going through GraphQL
2. **Isolated FileStore**: Creates a test-specific FileStore instance in `./.test-integration-data` directory
3. **No Server Required**: Tests run without starting a GraphQL server, making them faster and more reliable

## Key Components

### IntegrationTestingFramework
- Main orchestrator class that manages the entire test lifecycle
- Creates its own FileStore instance for isolation
- Directly calls backend functions for integration creation, workflow building, and execution

### Test Workflow
1. **Setup**: Creates integrations directly in the FileStore
2. **Build**: Uses `WorkflowBuilder` to build workflows
3. **Execute**: Uses `WorkflowExecutor` to run workflows
4. **Cleanup**: Removes all test data and cleans up the test directory

## Running Tests

```bash
# Run integration tests
npm run test:integration

# Run with specific config
npm run test:integration -- --config ./custom-config.json
```

## Configuration

The test configuration file (`integration-test-config.json`) controls:
- Which integrations to enable
- Which workflows to test
- Test suite settings

## Benefits of Direct Backend Approach

1. **Performance**: ~3-5x faster by eliminating GraphQL overhead
2. **Reliability**: No server startup/shutdown issues
3. **Isolation**: Each test run uses its own FileStore instance
4. **Simplicity**: Fewer moving parts means fewer things can go wrong

## Quick Start

### Prerequisites

1. **Environment Variables** - Create a `.env` file in the project root with your API credentials:
```bash
# Required
OPENAI_API_KEY=sk-...  # or GEMINI_API_KEY for Gemini
AUTH_TOKEN=your-superglue-auth-token

# Integration-specific (add as needed)
HUBSPOT_PRIVATE_APP_TOKEN=pat-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
JIRA_API_TOKEN=ATATT3xFfGF0...
ATTIO_API_TOKEN=...
SENDGRID_API_KEY=SG...
# etc.
```

2. **Running the Test Suite** 

```bash
cd packages/core
npm run test:integration
```

The test will:
1. Set up configured integrations
2. Build and execute enabled workflows
3. Generate detailed reports in `test-reports/`
4. Clean up all created resources

## Configuration

Tests are controlled via `packages/core/tests/integration-test-config.json`:

```json
{
  "integrations": {
    "enabled": ["hubspot-crm", "stripe-pay"]  // Which integrations to set up
  },
  "workflows": {
    "enabled": ["hubspot-lead-qualification", "stripe-revenue-analytics"]  // Which workflows to test
  },
  "testSuite": {
    "name": "Integration Test",
    "runCleanupTest": true,          // Clean up resources after test
    "waitForDocumentation": true     // Wait for API docs to process
  }
}
```

### Available Integrations

| ID | Service | Required Env Vars | Status |
|----|---------|-------------------|--------|
| `hubspot-crm` | HubSpot CRM | `HUBSPOT_PRIVATE_APP_TOKEN` | ✅ Working |
| `stripe-pay` | Stripe Payments | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | ✅ Working |
| `jira-projects` | JIRA | `JIRA_API_TOKEN` | ⚠️ Auth issues - token may be expired |
| `attio-crm` | Attio CRM | `ATTIO_API_TOKEN` | ❓ Untested |
| `postgres-lego` | LEGO Database | None (public) | ✅ Working |
| `timbuk2-shopify` | Shopify Demo | None (public) | ✅ Working |
| `supabase-db` | Supabase | Multiple keys required | ❓ Untested |
| `twilio-comm` | Twilio | Multiple keys required | ❓ Untested |
| `sendgrid-email` | SendGrid | `SENDGRID_API_KEY` | ❓ Untested |

### Available Workflows

**Single-System:**
- `hubspot-lead-qualification` - Update lead statuses
- `stripe-revenue-analytics` - Calculate MRR and churn
- `jira-sprint-health` - Sprint progress analysis
- `attio-contact-enrichment` - Link contacts to companies
- `lego-inventory-analysis` - Database queries
- `timbuk2-product-analysis` - Product catalog with pagination

**Multi-System:**
- `crm-to-email-workflow` - HubSpot → SendGrid
- `payment-to-db-sync` - Stripe → Supabase
- `project-notification-system` - JIRA → Twilio
- `customer-lifecycle-automation` - 4-system workflow
- `comprehensive-analytics-pipeline` - 5-system workflow

## Adding New Tests

### Add a New Integration

1. Add to `INTEGRATION_CONFIGS` in `integration-testing-framework.ts`:
```typescript
{
  id: 'new-api',
  name: 'New API',
  urlHost: 'https://api.example.com',
  urlPath: '/v1',
  documentationUrl: 'https://docs.example.com',
  credentials: { api_key: '' },  // Will be loaded from env
  description: 'Description'
}
```

2. Add credential loading in `loadCredentialsFromEnv()`:
```typescript
const newApiConfig = this.INTEGRATION_CONFIGS.find(c => c.id === 'new-api');
if (newApiConfig && process.env.NEW_API_KEY) {
  newApiConfig.credentials.api_key = process.env.NEW_API_KEY;
}
```

3. Add to `integration-test-config.json`:
```json
"enabled": ["new-api"]
```

### Add a New Workflow

Add to `TEST_WORKFLOWS` in `integration-testing-framework.ts`:
```typescript
{
  id: 'new-workflow',
  name: 'New Workflow Test',
  instruction: 'Natural language instruction',
  integrationIds: ['new-api'],
  payload: { /* test data */ },
  expectedKeys: ['expected', 'output', 'keys'],
  complexityLevel: 'medium',
  category: 'single-system'
}
```

## Test Reports

Reports are saved to `test-reports/` directory:

### Files Generated
- `integration-test-{timestamp}.json` - Complete test data
- `integration-test-{timestamp}.md` - Human-readable summary
- `latest.json` / `latest.md` - Symlinks to most recent reports

### Key Metrics Tracked

| Metric | Description |
|--------|-------------|
| **Overall Success Rate** | % of workflows that eventually succeeded |
| **Avg Workflow Build Time** | Time to generate workflow from instruction |
| **Avg Workflow Execution Time** | Time to run the workflow |
| **Avg Attempts Required** | How many retries needed for success |
| **First Try Success Rate** | % that worked on first attempt |

### Report Contents
- Detailed timing breakdowns (min/max/avg/p50/p95)
- Per-workflow results with error analysis
- AI-generated failure diagnostics
- Integration setup performance
- Recommendations for improvements

## Maintenance Notes

### Known Issues

1. **JIRA Authentication** - Current test account tokens frequently expire. You'll see:
   ```
   API call failed with status 401. Response: "Client must be authenticated to access this resource."
   ```
   Solution: Update `JIRA_API_TOKEN` with fresh token from Atlassian

2. **Test Data Dependencies** - Some workflows expect specific data:
   - HubSpot: Requires contacts created after specific dates
   - Stripe: Needs recent payment data
   - JIRA: Requires active sprint

3. **Rate Limits** - Running full test suite may hit API limits
   - Space out test runs
   - Use test/sandbox accounts when possible

4. **Long Test Duration** - Full suite can take 5+ minutes
   - Use `waitForDocumentation: false` for faster runs
   - Test specific workflows by editing config

### Troubleshooting

**Connection Issues (ECONNRESET)**
- Server may be overwhelmed
- Try running fewer workflows at once
- Check server logs for crashes

**Timeout Errors**
- Increase test timeout in vitest config
- Some workflows legitimately take 30+ seconds

**Missing Credentials**
- Check `.env` file has all required keys
- Verify keys are valid and not expired
- Use test/sandbox API keys when available

## Best Practices

1. **Start Small** - Test one integration/workflow at a time
2. **Use Test Accounts** - Don't run against production data
3. **Monitor Costs** - Some APIs charge per request
4. **Review Reports** - Check `test-reports/latest.md` for insights
5. **Update Config** - Disable failing integrations until fixed 