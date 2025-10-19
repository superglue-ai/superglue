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

- **Success Rates**: One-shot and self-healing success rates
- **Performance**: 
  - Average build time (overall across all attempts)
  - Average execution time (separated by one-shot vs self-healing)
- **Per-Workflow**: Individual workflow success rates, failure reasons, and timing metrics

### CSV Reports

Results are saved as timestamped CSV files in the `results/` folder:
- Format: `agent-eval-YYYY-MM-DDTHH-mm-ss.csv`
- Each workflow generates two rows (one-shot and self-healing modes)
- Columns: workflow_id, workflow_name, mode, total_attempts, total_successful_attempts, total_failed_attempts, has_one_shot_attempts, has_self_healing_attempts, had_one_shot_success, had_self_healing_success, success, avg_build_time_ms, avg_exec_time_ms, failures_build, failures_execution, failures_strict_validation

### Benchmark System

The `benchmark/` folder contains `agent-eval-benchmark.csv` - a baseline for comparison:
1. Run your evaluation to generate a CSV in `results/`
2. When satisfied with performance, copy that CSV to `benchmark/agent-eval-benchmark.csv`
3. Future runs compare against both the last run and the benchmark

### Metrics Comparison

The console output shows three-way comparison:
- **Current**: Current run results
- **vs Last**: Comparison with the most recent run in `results/`
- **vs Benchmark**: Comparison with the benchmark baseline

**Comparison indicators:**
- `+X%` / `-X%` for success rate changes
- `+Xs` / `-Xs` for performance time changes
- Per-workflow status changes (✓ ➔ ✗ or ✗ ➔ ✓)

This helps track agent performance over time and catch regressions during development.