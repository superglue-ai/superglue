# Superglue Integration Testing Framework

This document describes the comprehensive integration testing framework for Superglue, designed to evaluate workflow building and execution capabilities across multiple real-world integrations.

## Overview

The Integration Testing Framework provides:

- **Automated Setup**: Programmatically creates all required integrations
- **Comprehensive Testing**: Runs 10 carefully designed workflows (5 single-system, 5 multi-system)
- **Performance Metrics**: Tracks build times, execution times, and success / failure
- **Automated Cleanup**: Removes all test resources after completion
- **Detailed Reporting**: Provides comprehensive test results and benchmarks

## Architecture

### Components

1. **IntegrationTestingFramework**: Main class that orchestrates the entire test suite
2. **Integration Configurations**: 10 predefined integrations covering various API types
3. **Test Workflows**: 10 workflows spanning different complexity levels and integration patterns
4. **Metrics Collection**: Comprehensive performance and quality metrics
5. **Cleanup System**: Automatic resource cleanup

### Integration Inventory

#### Single-System Integrations
- **HubSpot CRM**: Customer relationship management
- **Stripe Payments**: Payment processing and subscriptions
- **JIRA Projects**: Project management and issue tracking
- **Attio CRM**: Modern CRM with OpenAPI specification
- **LEGO Database**: PostgreSQL database without documentation

#### Multi-System Support
- **Supabase Database**: Backend database operations
- **Twilio Communications**: SMS and phone services
- **SendGrid Email**: Email delivery and marketing
- **Shopify APIs**: E-commerce product catalogs (Timbuk2, Hydrogen)

### Test Workflows

#### Single-System Workflows (5)
1. **HubSpot Lead Qualification**: Contact analysis and status updates
2. **Stripe Revenue Analytics**: Financial reporting and customer analysis
3. **JIRA Sprint Health Check**: Sprint progress and blocker identification
4. **Attio Contact Enrichment**: Contact-company linking automation
5. **LEGO Inventory Analysis**: Complex database queries and analytics

#### Multi-System Workflows (5)
6. **CRM to Email Marketing**: HubSpot + SendGrid integration
7. **Payment to Database Sync**: Stripe + Supabase data pipeline
8. **Project Notification System**: JIRA + Twilio alert system
9. **Customer Lifecycle Automation**: 4-system customer journey (Stripe + HubSpot + SendGrid + Supabase)
10. **Comprehensive Analytics Pipeline**: 5-system data collection and reporting

## Usage

### Quick Start

```bash
# Run the full integration test suite
npm run test:integration

# Run only the framework unit tests
npm run test:integration-framework

# Run specific test categories
GRAPHQL_ENDPOINT=http://localhost:3000/graphql AUTH_TOKEN=your-token npm run test:integration
```

### Programmatic Usage

```typescript
import { IntegrationTestingFramework } from './integration-testing-framework.js';

// Run the complete test suite
const testSuite = await IntegrationTestingFramework.runFullTestSuite(
  'http://localhost:3000/graphql',
  'your-api-key'
);

console.log(`Tests: ${testSuite.totalTests}, Passed: ${testSuite.passed}, Failed: ${testSuite.failed}`);
console.log(`Success Rate: ${((testSuite.passed / testSuite.totalTests) * 100).toFixed(1)}%`);
```

### Advanced Usage

```typescript
// Create custom framework instance
const framework = new IntegrationTestingFramework(endpoint, apiKey);

// Setup integrations only
await framework.setupIntegrations();

// Run specific workflows (custom implementation needed)
// ... your custom workflow testing logic

// Cleanup resources
await framework.cleanup();
```

## Environment Configuration

### Required Environment Variables

```bash
GRAPHQL_ENDPOINT=http://localhost:4000/graphql  # Your Superglue GraphQL endpoint
AUTH_TOKEN=your-api-key                         # Your API authentication token
```

### Optional Configuration

```bash
DISABLE_LOGS=false                              # Disable logging output
DEBUG=false                                     # Enable debug mode
TIMEOUT=300000                                  # Overall test timeout (5 minutes)
```

## Test Results and Metrics

### Test Suite Output

The framework provides comprehensive reporting:

```
=== TEST SUITE SUMMARY ===
Suite: Integration Test Suite
Timestamp: 2024-01-15T10:30:00.000Z
Total Tests: 10
Passed: 8
Failed: 2
Success Rate: 80.0%
Average Build Time: 15420ms
Average Execution Time: 8750ms
Integration Setup Time: 45000ms
Cleanup Time: 12000ms

=== DETAILED RESULTS ===
✓ HubSpot Lead Qualification Pipeline (medium/single-system)
    Build: 12500ms | Execution: 6800ms | Quality: pass
    Expected: [contacts, updated_count, qualified_leads]
    Output: [contacts, updated_count, qualified_leads]

✗ Comprehensive Analytics Pipeline (high/multi-system)
    Build: 25000ms | Execution: 0ms | Quality: fail
    Error: Integration documentation still processing
```

### Metrics Collected

- **Build Time**: Time to build each workflow
- **Execution Time**: Time to execute each workflow
- **Data Quality**: Pass/Fail/Partial based on expected output keys
- **Success Rate**: Overall test success percentage
- **Complexity Distribution**: Performance by complexity level (low/medium/high)
- **Category Distribution**: Single-system vs multi-system performance

### Saved Results

Test results are automatically saved to `integration-test-results-{timestamp}.json` for:
- Historical tracking
- Performance regression analysis
- CI/CD integration
- Benchmarking

## Benchmarking and Performance

### Performance Baselines

The framework establishes baselines for:
- Workflow build times by complexity
- Execution performance by integration type
- Data quality standards
- Overall system reliability

### Regression Detection

Use the framework to detect regressions:
- Compare build times across versions
- Monitor success rate trends
- Track data quality consistency
- Identify performance bottlenecks

### CI/CD Integration

Example GitHub Action workflow:

```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:integration
        env:
          GRAPHQL_ENDPOINT: ${{ secrets.GRAPHQL_ENDPOINT }}
          AUTH_TOKEN: ${{ secrets.AUTH_TOKEN }}
```

## Customization

### Adding New Integrations

1. Add integration config to `INTEGRATION_CONFIGS`:

```typescript
{
  id: 'new-integration',
  name: 'New API Integration',
  urlHost: 'https://api.example.com',
  urlPath: '/v1',
  documentationUrl: 'https://docs.example.com/api',
  credentials: { api_key: 'your-key' },
  description: 'Description of the integration'
}
```

2. Add test workflow to `TEST_WORKFLOWS`:

```typescript
{
  id: 'new-workflow-test',
  name: 'New Integration Test',
  instruction: 'Test instruction for the new integration',
  integrationIds: ['new-integration'],
  testPayload: { /* test data */ },
  expectedKeys: ['expected', 'output', 'keys'],
  complexityLevel: 'medium',
  category: 'single-system'
}
```

### Custom Metrics

Extend the framework to collect custom metrics:

```typescript
interface CustomMetrics {
  apiCallCount: number;
  dataTransformationTime: number;
  errorRecoveryAttempts: number;
}
```

### Integration-Specific Testing

Create targeted test suites for specific integrations:

```typescript
const hubspotOnlyFramework = new IntegrationTestingFramework(endpoint, apiKey);
// Override configs to test only HubSpot workflows
```

## Troubleshooting

### Common Issues

1. **Documentation Processing Timeout**
   - Some integrations require time to process documentation
   - Framework waits up to 2 minutes by default
   - Increase timeout if needed

2. **API Rate Limiting**
   - Test workflows may hit API rate limits
   - Framework includes retry logic
   - Consider test data volume

3. **Credential Issues**
   - Ensure all integration credentials are valid
   - Check API key permissions
   - Verify endpoint accessibility

4. **Test Data Dependencies**
   - Some workflows require existing data (e.g., HubSpot contacts)
   - Set up test data before running full suite
   - Use sandbox/test environments

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true npm run test:integration
```

### Selective Testing

Test specific complexity levels or categories:

```typescript
// Custom framework implementation needed
const results = await framework.runTestSuite({
  complexityFilter: ['medium', 'high'],
  categoryFilter: ['multi-system']
});
```

## Future Enhancements

### Planned Features

- **Parallel Execution**: Run workflows concurrently for faster testing
- **Custom Assertions**: Domain-specific data quality checks
- **Performance Profiling**: Detailed performance breakdowns
- **A/B Testing**: Compare different workflow building strategies
- **Load Testing**: High-volume workflow execution testing

### Integration Ideas

- **Monitoring Integration**: Send results to monitoring platforms
- **Slack Notifications**: Alert team on test failures
- **Grafana Dashboards**: Visual performance tracking
- **Automated Reporting**: Regular performance reports

## Contributing

### Adding Test Cases

1. Identify integration scenarios not covered
2. Add appropriate integration configs
3. Create comprehensive test workflows
4. Validate expected outputs
5. Test edge cases and error conditions

### Performance Improvements

1. Profile framework execution
2. Optimize integration setup/teardown
3. Implement caching where appropriate
4. Parallelize independent operations

## Support

For issues, questions, or contributions:
1. Check existing test results and logs
2. Review troubleshooting section
3. Create detailed issue reports
4. Include test environment details

## License

This integration testing framework is part of the Superglue project and follows the same licensing terms. 

# Integration Testing Framework

Automated testing framework for Superglue workflow building and execution with real integrations.

## Quick Start - First Single System Workflow

### 1. Set Up Environment Variables

Create a `.env.test` file in your project root with the HubSpot credentials:

```bash
# Required for basic setup
GRAPHQL_ENDPOINT=http://localhost:3000/graphql
AUTH_TOKEN=your-superglue-auth-token

# Required for HubSpot workflow
HUBSPOT_PRIVATE_APP_TOKEN=your-hubspot-private-app-token
```

### 2. Configure Test Selection

The framework uses `integration-test-config.json` to select which integrations and workflows to test:

**Current config (testing first single system workflow):**
```json
{
  "integrations": {
    "enabled": ["hubspot-crm"]
  },
  "workflows": {
    "enabled": ["hubspot-lead-qualification"]
  },
  "testSuite": {
    "name": "Single HubSpot Workflow Test",
    "runCleanupTest": true,
    "waitForDocumentation": false
  }
}
```

### 3. Run the Test

```bash
cd packages/core
npm run test:integration
```

### 4. Expected Output

```
🚀 Starting Integration Testing Framework
Setting up integration: HubSpot CRM
Building workflow: HubSpot Lead Qualification Pipeline
Executing workflow...
✅ Passed: 1/1
📈 Success Rate: 100.0%
🧹 Cleanup completed
```

## Progressive Testing

### Step 1: Test Integration Setup + Cleanup Only

```json
{
  "integrations": { "enabled": ["hubspot-crm"] },
  "workflows": { "enabled": [] },
  "testSuite": { "runCleanupTest": true }
}
```

This will:
- Create the HubSpot integration
- Test that credentials work
- Clean up the integration
- Skip workflow execution

### Step 2: Add First Workflow

```json
{
  "integrations": { "enabled": ["hubspot-crm"] },
  "workflows": { "enabled": ["hubspot-lead-qualification"] },
  "testSuite": { "runCleanupTest": true }
}
```

### Step 3: Add Second Integration

```json
{
  "integrations": { "enabled": ["hubspot-crm", "stripe-pay"] },
  "workflows": { "enabled": ["hubspot-lead-qualification", "stripe-revenue-analytics"] }
}
```

Add to your `.env.test`:
```bash
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
```

### Step 4: Test Multi-System Workflow

```json
{
  "integrations": { "enabled": ["hubspot-crm", "sendgrid-email"] },
  "workflows": { "enabled": ["crm-to-email-workflow"] }
}
```

Add to your `.env.test`:
```bash
SENDGRID_API_KEY=your-sendgrid-api-key
```

## Available Integrations

| ID | Service | Required Env Vars |
|----|---------|-------------------|
| `hubspot-crm` | HubSpot CRM | `HUBSPOT_PRIVATE_APP_TOKEN` |
| `stripe-pay` | Stripe Payments | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` |
| `jira-projects` | JIRA Projects | `JIRA_API_TOKEN` |
| `attio-crm` | Attio CRM | `ATTIO_API_TOKEN` |
| `timbuk2-shopify` | Shopify Demo | None (public API) |
| `postgres-lego` | LEGO Database | None (public) |
| `supabase-db` | Supabase DB | `SUPABASE_PASSWORD`, `SUPABASE_PUBLIC_API_KEY`, `SUPABASE_SECRET_KEY` |
| `twilio-comm` | Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_SID`, `TWILIO_TEST_AUTH_TOKEN`, `TWILIO_SECRET_KEY` |
| `sendgrid-email` | SendGrid | `SENDGRID_API_KEY` |

## Available Workflows

### Single-System Workflows
- `hubspot-lead-qualification` - Update lead statuses based on engagement scores
- `stripe-revenue-analytics` - Calculate MRR and identify churned customers
- `jira-sprint-health` - Analyze sprint completion and blocked issues
- `attio-contact-enrichment` - Link contacts to companies by email domain
- `lego-inventory-analysis` - Analyze LEGO themes by set count
- `timbuk2-product-analysis` - Get all products with pagination

### Multi-System Workflows
- `crm-to-email-workflow` - HubSpot leads → SendGrid emails
- `payment-to-db-sync` - Stripe payments → Supabase storage
- `project-notification-system` - JIRA tickets → Twilio SMS
- `customer-lifecycle-automation` - Stripe + HubSpot + SendGrid
- `comprehensive-analytics-pipeline` - All systems combined

## Running Tests

### Basic Usage
```bash
npm run test:integration
```

### With Custom Config
```bash
npm run test:integration -- --config=./my-test-config.json
```

### Environment Variables
```bash
# Use different endpoint
GRAPHQL_ENDPOINT=https://my-superglue-instance.com/graphql npm run test:integration

# Load from specific env file
export $(cat .env.test | xargs) && npm run test:integration
```

## Interpreting Results

### Success Indicators
- ✅ Integration setup successful
- ✅ Workflow builds without errors
- ✅ Workflow executes successfully
- ✅ Data quality check passes
- ✅ Cleanup completes

### Common Failure Modes
- **Setup fails**: Check credentials and network connectivity
- **Build fails**: Check instruction clarity and integration availability
- **Execution fails**: Check API quotas and data availability
- **Data quality fails**: Check expected output keys vs actual output

### Results File
Each test run creates a timestamped JSON file:
```
integration-test-results-2025-01-25T10-30-45-123Z.json
```

Contains:
- Individual workflow results
- Timing metrics
- Error details
- Data quality analysis

## Cleanup Testing

The framework automatically tests cleanup after each run. To test cleanup independently:

```json
{
  "integrations": { "enabled": ["hubspot-crm"] },
  "workflows": { "enabled": [] },
  "testSuite": { "runCleanupTest": true }
}
```

This creates integrations and immediately cleans them up without running workflows.

## Debugging

### Enable Verbose Logging
Check the Superglue server logs for detailed workflow execution info.

### Test Individual Components
1. **Credentials**: Check if integration setup succeeds
2. **Workflow Building**: Look for LLM/API errors in build phase
3. **Workflow Execution**: Check integration-specific error messages
4. **Data Quality**: Compare `expectedKeys` vs `outputKeys` in results

### Common Issues
- **Missing credentials**: Check environment variables
- **API rate limits**: Space out test runs
- **Network timeouts**: Check firewall/proxy settings
- **Stale data**: Some workflows expect recent data (adjust payloads) 