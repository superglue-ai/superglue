# Agent Evaluation

Automated testing framework for Superglue's agent capabilities across multiple API integrations.

## Getting Started

### Prerequisites

- Node.js installed
- API credentials for integrations you want to test

### Quick Start

1. **Set up config**

   Copy your config file to `packages/core/eval/agent-eval/agent-eval-config.json`

2. **Add credentials to `.env`**

   Add your API credentials to the root `.env` file. Use this pattern:
   ```
   {INTEGRATION_ID}_{CREDENTIAL_KEY}
   ```

   Example - for an integration with `id: "stripe"` and credential key `"secret_key"`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_your_key_here
   ```

   All credentials from your config must be in `.env` with uppercase naming.

3. **Run evaluation**

   ```bash
   npm run test:agent-eval
   ```

4. **View results**

   - Console output shows immediate results
   - `results/` folder contains timestamped CSV and Markdown reports

## Configuration

### Config File Structure

The `agent-eval-config.json` defines integrations and workflows:

```json
{
  "integrations": [
    {
      "id": "myapi",
      "name": "My API",
      "urlHost": "https://api.myapi.com",
      "urlPath": "/v1",
      "documentationUrl": "https://docs.myapi.com",
      "credentials": {
        "api_key": ""
      },
      "keywords": ["users", "data"]
    }
  ],
  "workflows": [
    {
      "id": "my-workflow",
      "name": "My Workflow",
      "type": "retrieval",
      "instruction": "Get all users from MyAPI",
      "integrationIds": ["myapi"],
      "expectedData": {
        "users": []
      }
    }
  ],
  "enabledWorkflows": "all",
  "settings": {
    "runOneShotMode": true,
    "runSelfHealingMode": true,
    "attemptsEachMode": 2
  }
}
```

**Key fields:**

- `integrations`: Array of API integrations to test
  - `id`: Used for credential lookup in `.env`
  - `credentials`: Keys that must exist as env vars
  - `urlHost`, `documentationUrl`: Used by agent for API understanding

- `workflows`: Array of test workflows
  - `instruction`: Natural language description of what to do
  - `integrationIds`: Which integration(s) to use
  - `expectedData`: Optional validation data
  - `type`: `"retrieval"`, `"action"`, or `"upsert"`

- `enabledWorkflows`: `"all"` or array of workflow IDs to run

- `settings`:
  - `runOneShotMode`: Test without retries
  - `runSelfHealingMode`: Test with error recovery
  - `attemptsEachMode`: Attempts per mode (for determinism testing)

## Benchmarking

To track performance over time, set up a benchmark:

1. Run evaluation and review results
2. Copy a good run to use as baseline:
   ```bash
   cp results/agent-eval-YYYY-MM-DDTHH-mm-ss.csv benchmark/agent-eval-benchmark.csv
   ```
3. Future runs will compare against this benchmark

The benchmark file is not in version control - each environment maintains its own baseline.
