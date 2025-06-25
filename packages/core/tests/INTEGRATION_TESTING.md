# Superglue Integration Testing Framework

This document describes the comprehensive integration testing framework for Superglue, designed to evaluate workflow building and execution capabilities across multiple real-world integrations.

## Overview

The Integration Testing Framework provides:

- **Automated Setup**: Programmatically creates all required integrations
- **Comprehensive Testing**: Runs 10 carefully designed workflows (5 single-system, 5 multi-system)
- **Performance Metrics**: Tracks build times, execution times, and data quality
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
GRAPHQL_ENDPOINT=http://localhost:4000/graphql AUTH_TOKEN=your-token npm run test:integration
```

### Programmatic Usage

```typescript
import { IntegrationTestingFramework } from './integration-testing-framework.js';

// Run the complete test suite
const testSuite = await IntegrationTestingFramework.runFullTestSuite(
  'http://localhost:4000/graphql',
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