# Evaluation Scripts

This folder contains evaluation and testing scripts for the Superglue project.

## Structure

### `/utils`
Shared utilities used by both integration testing and API ranking:
- `config-loader.ts` - Loads and validates configuration files
- `setup-manager.ts` - Manages test environment setup (datastore, integrations, documentation)
- `workflow-runner.ts` - Runs workflows with configurable options for metrics collection
- `workflow-report-generator.ts` - Generates detailed error reports and analysis using AI

### `/integration-testing`
Comprehensive integration testing framework:
- `integration.test.ts` - Vitest test entry point
- `integration-testing-framework.ts` - Main test orchestration
- `integration-test-config.json` - Configuration for integration tests

### `/api-ranking`
API performance ranking system:
- `index.ts` - Entry point for API ranking generation
- `api-ranking-config.json` - Configuration for API ranking

## Usage

### Running Integration Tests
```bash
npm run test:integration
```

### Generating API Rankings
```bash
npm run generate-ranking
```

## Shared Components

Both systems use the shared utilities for:
1. Loading and validating configurations
2. Setting up test environments with integrations
3. Running workflows with retry logic and metrics collection
4. Analyzing workflow execution failures (when needed)

The integration testing framework adds:
- Detailed error analysis and reporting
- Log collection and processing
- Complex test suite management

The API ranking system focuses on:
- Success rate calculations
- Performance metrics
- Ranking generation 