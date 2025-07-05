# Integration Testing Framework

## Overview

The integration testing framework provides automated, multi-attempt reliability testing for Superglue workflows, with deep diagnostics and AI-powered error analysis. It is designed for speed, isolation, and actionable reporting, supporting modern API ranking and robust credential management.

## Architecture & Key Features

- **Direct Backend Access**: Uses `WorkflowBuilder` and `WorkflowExecutor` directly—bypassing GraphQL for speed and determinism.
- **Isolated FileStore**: Each test run uses a dedicated FileStore in `./.test-integration-data` for clean, repeatable state.
- **No Server Required**: Tests run entirely in-process; no GraphQL or web server needed.
- **Multi-Attempt Reliability**: Each workflow is built and executed multiple times to measure flakiness and real-world reliability.
- **API Ranking**: Workflows can be ranked by reliability, execution time, and retry count, with a combined score for agentic use cases.
- **Log Capture**: All logs (WARN/ERROR/DEBUG) for each workflow execution are captured and included in reports for root-cause analysis.
- **Modern Credential Handling**: Credentials are loaded from environment variables using a namespaced pattern, with clear error reporting for missing secrets.
- **AI-Powered Analysis**: Uses LLMs to analyze error patterns, categorize issues, and generate actionable recommendations for each workflow.
- **Comprehensive Reporting**: Generates both JSON and Markdown reports, including data previews, error summaries, and API rankings.

## How It Works

1. **Setup**: Loads config, maps credentials from env, and creates integrations in the test FileStore.
2. **Build**: Uses `WorkflowBuilder` to generate workflow plans from natural language instructions and integration configs.
3. **Execute**: Runs each workflow multiple times, capturing all logs and measuring execution time, retries, and success rate.
4. **Analyze**: Uses `WorkflowReportGenerator` (LLM) to analyze all attempts, deduplicate errors, and provide categorized, actionable feedback.
5. **API Ranking**: Optionally ranks APIs by reliability, speed, and retry count for agentic selection.
6. **Report**: Saves detailed JSON and Markdown reports, including data previews (up to 1000 chars), error analysis, and ranking tables.
7. **Cleanup**: Removes all test data for a clean slate.

## Running Tests

```bash
npm run test:integration
```
- Runs all enabled workflows, generates reports in `test-reports/`, and cleans up after itself.

## Configuration

Edit `packages/core/tests/integration-test-config.json`:
- Enable/disable integrations and workflows
- Set number of attempts per workflow
- Configure API ranking workflows

## Environment Variables

Set credentials in your `.env` file using the pattern:
```
INTEGRATIONID_CREDENTIALKEY=your_secret
```
Example:
```
HUBSPOT_PRIVATE_APP_TOKEN=pat-...
STRIPE_SECRET_KEY=sk_test_...
```

## Reports

- **JSON**: Full details, all attempts, logs, and AI analysis
- **Markdown**: Human-readable summary, API ranking, error breakdown, and data previews (up to 1000 chars)
- **Symlinks**: `latest.json` and `latest.md` always point to the most recent run

## Best Practices

- Start with one integration/workflow at a time
- Use test accounts, not production data
- Monitor LLM/API usage and costs
- Review AI analysis for actionable fixes
- Keep credentials up to date
- Run regularly to catch regressions

## Troubleshooting

- **Missing credentials**: Framework will error with a list of missing env vars
- **Timeouts**: Some APIs/workflows are slow; timeouts are configurable
- **LLM failures**: Tests run without AI analysis if LLM credentials are missing
- **Cleanup**: Test data is auto-removed; manual cleanup: `rm -rf .test-integration-data`

---

This framework is designed for modern, agentic, and robust integration testing—giving you deep insight into both reliability and root causes of failure, with minimal setup and maximum automation. 