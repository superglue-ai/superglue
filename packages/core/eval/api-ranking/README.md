# API Ranking Generator

This tool generates performance rankings for various APIs by running workflows through Superglue and measuring success rates, execution times, and API reliability metrics.

## Overview

The API Ranking Generator evaluates APIs across multiple dimensions:
1. **Success Rate**: How often workflows complete successfully
2. **Execution Time**: How fast successful workflows complete
3. **API Reliability**: Number of API call failures during execution
4. **LLM Comparison**: How well various LLM models (Claude Sonnet/Opus, GPT-4.1, O4 Mini, Gemini) perform the same tasks

## Experiment Methodology

### Superglue Evaluation
1. Each workflow is run multiple times (default: 5 attempts)
2. For each attempt:
   - Build the workflow using LLM to generate API configurations
   - Execute the workflow and collect all logs
   - Track success/failure and timing metrics
   - Count API call failures from logs
3. Calculate metrics across all attempts:
   - Success rate (% of attempts that succeeded)
   - Average execution time (successful attempts only)
   - Total API call failures across all attempts

### Direct LLM Evaluation
To compare Superglue's performance with direct LLM usage:

1. **Multiple LLM models** are evaluated in parallel:
   - Claude Sonnet 4 (20250514)
   - Claude Opus 4 (20250514)
   - GPT-4.1
   - O4 Mini
   - Gemini 2.5 Flash
   
Each model is given:
   - The same workflow instruction
   - Integration details (API endpoints, credentials)
   - A request to generate executable JavaScript code

2. The generated code is executed in a sandboxed Node.js environment with:
   - Access to `fetch` for API calls
   - The same credentials available
   - A 60-second timeout

3. Success is determined by:
   - Code executes without errors
   - Returns the expected data structure
   - Completes within the timeout

**Models Used:**
- **Claude Sonnet 4**: `claude-sonnet-4-20250514`
- **Claude Opus 4**: `claude-opus-4-20250514`
- **GPT-4.1**: `gpt-4.1`
- **O4 Mini**: `o4-mini`
- **Gemini 2.5 Flash**: `gemini-2.5-flash`

This provides a fair comparison of how well different approaches handle the same API integration tasks.

## Scoring System

### Superglue Score Calculation

The score combines three factors:

```
Base Score = Success Rate (0-1)

API Failure Penalty = min(0.2, failedApiCalls * 0.02)
Time Penalty = min(0.1, max(0, (avgExecutionTime - 1000) / 90000))

Final Score = Base Score - API Failure Penalty - Time Penalty
```

**Scoring Components:**
- **Success Rate**: Primary factor (0-100% mapped to 0-1)
- **API Failures**: Each failed API call reduces score by 0.02 (max penalty: 0.2)
- **Execution Time**: Fast workflows (<1s) get no penalty, slow workflows (>10s) get up to -0.1

**Note on Time Penalty**: Execution time is also dependent on the API's response time, data volume, and instruction complexity. This penalty favors simpler workflows but is mainly designed to capture API call failures, transformation failures and failling response evaluations.

### Failed Workflows
Workflows that never succeed get minimal scores:
- 0.1 base if they fail to build
- 0.2 base if they build but fail execution

## Configuration

The API ranking system is configured through `api-ranking-config.json`. Key settings include:

- **`settings.attemptsPerWorkflow`**: Number of times to run each workflow (default: 5)
- **`settings.delayBetweenAttempts`**: Milliseconds to wait between retry attempts (default: 0)
  - Set to 0 for fast evaluation during development
  - Use 1000-2000ms when testing against production APIs to avoid rate limiting
- **`workflowsToRank`**: Array of workflow IDs to include in the ranking
- **`integrations`**: API configurations with credentials and documentation URLs
- **`workflows`**: Workflow definitions with instructions and expected inputs

## Usage

### Generate Rankings
```bash
npm run generate-ranking
```

This will:
1. Load environment variables and validate credentials
2. Create a temporary datastore in `./.api-ranking-data`
3. Setup integrations with async documentation fetching
4. Run all workflows with log collection
5. Run direct LLM evaluations (if API keys available)
6. Calculate scores and generate `ranking.csv`
7. Clean up the temporary datastore

## Output

The generated `ranking.csv` contains:
- **Rank**: Position based on Superglue Score
- **API**: Name of the API/integration
- **Superglue Score**: Combined performance score (0-1)
- **Superglue Success %**: Percentage of successful runs
- **Claude Sonnet 4**: Success rate for Claude Sonnet 4
- **Claude Opus 4**: Success rate for Claude Opus 4
- **GPT-4.1**: Success rate for GPT-4.1
- **O4 Mini**: Success rate for O4 Mini
- **Gemini 2.5 Flash**: Success rate for Gemini 2.5 Flash
- **Instruction Prompt**: The workflow instruction used

## Adding New APIs

To add a new API to the ranking:
1. Add the integration configuration to `integrations` in the config
2. Add a test workflow to `workflows`
3. Add the workflow ID to `workflowsToRank`
4. Ensure environment variables are set for credentials

## Environment Variables

### API Credentials
Required environment variables follow the pattern:
`{INTEGRATION_ID}_{CREDENTIAL_KEY}` (all uppercase, hyphens replaced with underscores)

For example:
- `HUBSPOT_PRIVATE_APP_TOKEN`
- `STRIPE_SECRET_KEY`
- `GITHUB_API_KEY`

### LLM API Keys (Optional)
For direct LLM comparison:
- `OPENAI_API_KEY` - For GPT-4.1 and O4 Mini evaluation
- `ANTHROPIC_API_KEY` - For Claude Sonnet and Opus evaluation
- `GOOGLE_GENERATIVE_AI_API_KEY` - For Gemini evaluation

If these are not provided, LLM comparison columns will show 0% for the respective models.

## Metrics and Logging

The system tracks:
- Build times and success rates
- Execution times and success rates
- API call failures (via log analysis)
- Detailed error messages for debugging
- LLM code generation success rates