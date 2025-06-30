# Integration Testing Framework

## Overview

The integration testing framework is designed to test Superglue's workflow building and execution capabilities across multiple integrations in an automated, repeatable manner. It includes AI-powered analysis to diagnose failures and provide actionable insights.

## Architecture

The framework bypasses the GraphQL layer and directly uses backend functions for improved performance:

1. **Direct Backend Access**: Uses `WorkflowBuilder` and `WorkflowExecutor` directly instead of going through GraphQL
2. **Isolated FileStore**: Creates a test-specific FileStore instance in `./.test-integration-data` directory
3. **No Server Required**: Tests run without starting a GraphQL server, making them faster and more reliable
4. **AI-Powered Analysis**: Uses LLM to analyze failures and provide recommendations

## Key Components

### IntegrationTestingFramework
- Main orchestrator class that manages the entire test lifecycle
- Creates its own FileStore instance for isolation
- Directly calls backend functions for integration creation, workflow building, and execution
- Runs each workflow multiple times to measure reliability

### WorkflowReportGenerator
The report generator provides AI-powered analysis of workflow execution:

- **Batch Analysis**: Analyzes all attempts for a workflow together to identify patterns
- **Error Deduplication**: Groups similar errors to avoid redundant analysis
- **Categorized Issues**: Breaks down problems into:
  - Planning Issues (workflow generation problems)
  - API Issues (endpoint/method problems)
  - Integration Issues (auth/credential problems)
  - Data Issues (mapping/transformation problems)
- **Actionable Recommendations**: Provides specific fixes for identified issues
- **Suite-Level Analysis**: Identifies systemic patterns across all workflows

### Test Workflow
1. **Setup**: Creates integrations directly in the FileStore
2. **Build**: Uses `WorkflowBuilder` to build workflows
3. **Execute**: Uses `WorkflowExecutor` to run workflows
4. **Analyze**: Uses `WorkflowReportGenerator` for AI-powered diagnostics
5. **Cleanup**: Removes entire test directory

## Running Tests

```bash
# Run integration tests
npm run test:integration

# Run all tests except integration tests
npm run test

# Run tests with coverage
npm run test:coverage
```

## Configuration

The test configuration file (`integration-test-config.json`) controls:
- Which integrations to enable
- Which workflows to test
- Number of attempts per workflow (default: 3)

## Quick Start

### Prerequisites

1. **Environment Variables** - Create a `.env` file in the project root with your API credentials:
```bash
# Required for AI analysis
OPENAI_API_KEY=sk-...  # or GEMINI_API_KEY for Gemini
LLM_PROVIDER=OPENAI    # or GEMINI

# Integration-specific (add as needed)
HUBSPOT_PRIVATE_APP_TOKEN=pat-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
JIRA_API_TOKEN=ATATT3xFfGF0...
ATTIO_API_TOKEN=...
SENDGRID_API_KEY=SG...
POSTGRES_LEGO_CONNECTION_STRING=postgres://user:pass@host:port/db
# etc.
```

2. **Running the Test Suite** 

```bash
npm run test:integration
```

The test will:
1. Set up configured integrations
2. Build and execute each workflow multiple times
3. Generate AI-powered analysis for failures
4. Save detailed reports in `test-reports/`
5. Clean up by removing the test directory

## Configuration

Tests are controlled via `packages/core/tests/integration-test-config.json`:

```json
{
  "integrations": {
    "enabled": ["hubspot-crm", "stripe-pay"],  // Which integrations to set up
    "definitions": {
      // Integration configurations with credentials
    }
  },
  "workflows": {
    "enabled": ["hubspot-lead-qualification"],  // Which workflows to test
    "definitions": {
      // Workflow definitions with instructions and expected outputs
    }
  },
  "testSuite": {
    "name": "Integration Test",
    "attemptsPerWorkflow": 3  // How many times to run each workflow
  }
}
```

### Available Integrations

| ID | Service | Required Env Vars | Status |
|----|---------|-------------------|--------|
| `hubspot-crm` | HubSpot CRM | `HUBSPOT_PRIVATE_APP_TOKEN` | ✅ Working |
| `stripe-pay` | Stripe Payments | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | ✅ Working |
| `jira-projects` | JIRA | `JIRA_API_TOKEN` | ✅ Working |
| `attio-crm` | Attio CRM | `ATTIO_API_TOKEN` | ✅ Working |
| `postgres-lego` | LEGO Database | `POSTGRES_LEGO_CONNECTION_STRING` | ✅ Working |
| `timbuk2-shopify` | Shopify Demo | None (public) | ✅ Working |
| `supabase-db` | Supabase | Multiple keys required | ✅ Working |
| `twilio-comm` | Twilio | Multiple keys required | ❓ Untested |
| `sendgrid-email` | SendGrid | `SENDGRID_API_KEY` | ❓ Untested |

### Available Workflows

**Single-System:**
- `hubspot-lead-qualification` - Update lead statuses
- `stripe-revenue-analytics` - Calculate MRR
- `jira-sprint-health` - Sprint progress analysis
- `attio-contact-enrichment` - Find contacts without companies
- `lego-inventory-analysis` - Database queries
- `timbuk2-product-analysis` - Product catalog with pagination

**Multi-System:**
- `crm-to-email-workflow` - HubSpot → SendGrid
- `payment-to-db-sync` - Stripe → Supabase

## Test Reports

Reports are saved to `test-reports/` directory:

### Files Generated
- `integration-test-{timestamp}.json` - Complete test data with AI analysis
- `integration-test-{timestamp}.md` - Human-readable summary
- `latest.json` / `latest.md` - Copies of most recent reports

### Key Metrics Tracked

| Metric | Description |
|--------|-------------|
| **Overall Success Rate** | % of workflows that eventually succeeded |
| **Global Success Rate** | % of all workflow attempts that succeeded |
| **Avg Workflow Build Time** | Time to generate workflow from instruction |
| **Avg Workflow Execution Time** | Time to run the workflow |
| **Avg Attempts Until Success** | How many tries successful workflows needed |
| **First Try Success Rate** | % that worked on first attempt |

### Report Contents
- Per-workflow success rates across multiple attempts
- AI-generated failure analysis with categorized issues
- Specific recommendations for fixing problems
- Integration setup performance metrics
- Suite-level pattern analysis

### AI Analysis Categories

The WorkflowReportGenerator categorizes issues into:

1. **Planning Issues**: Problems understanding instructions or generating appropriate steps
2. **API Issues**: Incorrect endpoints, methods, or request formatting
3. **Integration Issues**: Authentication failures or credential problems
4. **Data Issues**: Mapping errors, transformation problems, or schema mismatches

## Adding New Tests

### Add a New Integration

1. Add to `integration-test-config.json` under `integrations.definitions`:
```json
"new-api": {
  "id": "new-api",
  "name": "New API",
  "urlHost": "https://api.example.com",
  "urlPath": "/v1",
  "documentationUrl": "https://docs.example.com",
  "credentials": {
    "api_key": ""  // Will be loaded from env
  },
  "description": "Description"
}
```

2. Add credential loading in `loadCredentialsFromEnv()`:
```typescript
const newApiConfig = definitions['new-api'];
if (newApiConfig && process.env.NEW_API_KEY) {
  newApiConfig.credentials.api_key = process.env.NEW_API_KEY;
}
```

3. Enable it in the config:
```json
"enabled": ["new-api"]
```

### Add a New Workflow

Add to `integration-test-config.json` under `workflows.definitions`:
```json
"new-workflow": {
  "id": "new-workflow",
  "name": "New Workflow Test",
  "instruction": "Natural language instruction",
  "integrationIds": ["new-api"],
  "payload": { /* test data */ },
  "expectedKeys": ["expected", "output", "keys"],
  "complexityLevel": "medium",
  "category": "single-system"
}
```

## Maintenance Notes

### Performance Optimizations

1. **Batch LLM Analysis**: All attempts for a workflow are analyzed together
2. **Error Deduplication**: Similar errors are grouped to reduce LLM calls
3. **Simplified Prompts**: Workflow plans are truncated to essential information
4. **Direct Backend Access**: Bypasses GraphQL for faster execution

### Known Issues

1. **JIRA Authentication** - Tokens frequently expire
   ```
   API call failed with status 401. Response: "Client must be authenticated to access this resource."
   ```
   Solution: Update `JIRA_API_TOKEN` with fresh token

2. **Test Data Dependencies** - Some workflows expect specific data:
   - HubSpot: Requires contacts created after specific dates
   - Stripe: Needs recent payment data
   - JIRA: Requires active sprint

3. **LLM API Limits** - Full test suite makes ~20-40 LLM calls
   - Monitor API usage and costs
   - Tests gracefully degrade if LLM fails

### Troubleshooting

**Missing LLM Credentials**
- Tests will run but without AI analysis
- Set `OPENAI_API_KEY` or `GEMINI_API_KEY` for full functionality

**Timeout Errors**
- Some workflows legitimately take 30+ seconds
- Documentation processing can take 2+ minutes
- Test timeout is set to 120 minutes

**Cleanup Issues**
- Test directory `.test-integration-data` is automatically removed
- Manual cleanup: `rm -rf ./.test-integration-data`

## Best Practices

1. **Start Small** - Test one integration/workflow at a time
2. **Use Test Accounts** - Don't run against production data
3. **Monitor Costs** - LLM analysis and API calls have costs
4. **Review AI Analysis** - Check error categorization in reports
5. **Update Credentials** - Keep API tokens fresh
6. **Run Regularly** - Catch regressions early 