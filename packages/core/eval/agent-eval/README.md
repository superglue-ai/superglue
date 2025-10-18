# Agent Evaluation

Test Superglue's agent capabilities across multiple integrations.

## Usage

1. Add your API credentials to `.env` file
2. Run the evaluation:

```bash
npm run test:agent-eval
```

## What it does

1. Fetches integrations and loads workflows from config
2. Runs each workflow in both one-shot and self-healing modes
3. Calculates success rates and performance metrics
4. Reports results to console

## Config

Edit `agent-eval-config.json` to:
- Enable/disable workflows
- Set expected data for validation
- Define integrations and their credentials

### Settings

Configure test execution behavior in the `settings` section:

```json
{
  "settings": {
    "runOneShotMode": true,        // Run workflows without self-healing
    "runSelfHealingMode": true,    // Run workflows with self-healing
    "attemptsEachMode": 2          // Number of attempts per mode
  }
}
```

- **runOneShotMode**: Tests the agent's ability to build and execute workflows correctly on the first try
- **runSelfHealingMode**: Tests the agent's ability to recover from execution failures by analyzing errors and regenerating API configs
- **attemptsEachMode**: Number of times to run each workflow in each mode (increases statistical confidence)

### Enabled Workflows

Control which workflows to run:

```json
{
  "enabledWorkflows": "all"  // Run all workflows
}
```

Or specify individual workflows:

```json
{
  "enabledWorkflows": [
    "clickup-task-list",
    "github-list-repos"
  ]
}
```

### Environment Variables

Credentials are loaded from `.env` using this pattern:
```
{INTEGRATION_ID}_{CREDENTIAL_KEY}
```

Example:
- Integration ID: `clickup`
- Credential key: `api_token`
- Environment variable: `CLICKUP_API_TOKEN`

```bash
# .env
CLICKUP_API_TOKEN=your_token_here
STRIPE_SECRET_KEY=your_key_here
TYPEFORM_PERSONAL_ACCESS_TOKEN=your_token_here
```

## Metrics & Comparison

The evaluation tracks and compares metrics across runs:

### Tracked Metrics

- **Success Rates**: Overall, one-shot, and self-healing success rates
- **Performance**: Average build and execution times
- **Per-Workflow**: Individual workflow success rates and failure reasons

### Metrics Comparison

Results are saved to `agent-eval-results.json` after each run. The metrics comparer automatically:

1. Loads the previous run's metrics
2. Compares current vs previous results
3. Shows differences in the console output (green for improvements, red for regressions)

**Comparison indicators:**
- `+X%` / `-X%` for success rate changes
- `+Xs` / `-Xs` for performance time changes
- Per-workflow status changes (✓ ➔ ✗ or ✗ ➔ ✓)

This helps track agent performance over time and catch regressions during development.