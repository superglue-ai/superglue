# API Ranking Generator

This tool generates performance rankings for various APIs by running workflows through Superglue and measuring success rates and execution times.

## Overview

The API Ranking Generator:
1. Loads API configurations and workflow definitions
2. Sets up integrations with documentation fetching
3. Runs each workflow multiple times (configurable)
4. Calculates a "Superglue Score" based on:
   - Success rate (primary factor)
   - Average execution time
   - Average build time
5. Generates a ranking CSV file

## Configuration

The ranking is configured in `api-ranking-config.json`:
- `integrations`: API configurations with credentials
- `workflows`: Workflow definitions to test
- `workflowsToRank`: List of workflow IDs to include in ranking
- `settings.attemptsPerWorkflow`: Number of times to run each workflow

## Superglue Score Calculation

The score is calculated as:
- Base score = success rate (0-1)
- Time penalty for slower workflows (up to -0.1)
- Failed workflows get minimal scores (0.1-0.2)

## Usage

### Test Setup
```bash
npm run build && node dist/eval/api-ranking/test.js
```

### Generate Rankings
```bash
npm run generate-ranking
```

This will:
1. Create a temporary datastore in `./.api-ranking-data`
2. Run all workflows in the config
3. Generate/update `ranking.csv`
4. Clean up the temporary datastore

## Output

The generated `ranking.csv` contains:
- **Rank**: Position based on Superglue Score
- **API**: Name of the API/integration
- **Superglue Score**: Combined performance score (0-1)
- **Superglue Success %**: Percentage of successful runs
- **ChatGPT Success %**: Placeholder (0%)
- **Claude Success %**: Placeholder (0%)
- **Instruction Prompt**: The workflow instruction used

## Adding New APIs

To add a new API to the ranking:
1. Add the integration configuration to `integrations` in the config
2. Add a test workflow to `workflows`
3. Add the workflow ID to `workflowsToRank`
4. Ensure environment variables are set for credentials

## Environment Variables

Required environment variables follow the pattern:
`{INTEGRATION_ID}_{CREDENTIAL_KEY}` (all uppercase, hyphens replaced with underscores)

For example:
- `HUBSPOT_PRIVATE_APP_TOKEN`
- `STRIPE_SECRET_KEY`
- `GITHUB_API_KEY`
- `TIMBUK2_SHOPIFY_` (no credentials needed) 