# Agent Evaluation

Automated testing framework for Superglue's agent capabilities across multiple API integrations.

## Getting Started

1. **Set up config**

   Copy your config file to `packages/core/eval/agent-eval/agent-eval-config.json`

2. **Add credentials**

   Add your API credentials to root `.env` or as environment variables (see [Credentials Setup](#credentials-setup) for naming rules)

3. **Add benchmark (optional)**

   Copy your benchmark file to `packages/core/eval/agent-eval/benchmark/agent-eval-benchmark.csv` (see [Benchmarking](#benchmarking) for details)

4. **Run evaluation**

   ```bash
   npm run test:agent-eval
   ```

5. **View results**

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
  - `id`: Used for credential lookup as env vars
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

### Credentials Setup

API credentials must be available as environment variables using this naming pattern:

```
{INTEGRATION_ID}_{CREDENTIAL_KEY}
```

**Example:** For an integration with `id: "stripe"` and credential key `"secret_key"`:

```bash
STRIPE_SECRET_KEY=sk_test_your_key_here
```

You can set these in the root `.env` file or directly as environment variables in your shell.

**Rules:**
- Use uppercase for the entire variable name
- All credentials defined in your config's `credentials` object must be available as env vars
- The integration `id` from config becomes the prefix
- Multiple credentials per integration are supported:
  ```bash
  MYAPI_API_KEY=key123
  MYAPI_SECRET=secret456
  ```

## Benchmarking

Benchmarking tracks performance over time by comparing current runs against a baseline.

### Setting Up a Benchmark

1. Run your first evaluation
2. Review results in the `results/` folder
3. Copy a good run to use as your baseline:
   ```bash
   cp results/agent-eval-YYYY-MM-DDTHH-mm-ss.csv packages/core/eval/agent-eval/benchmark/agent-eval-benchmark.csv
   ```
4. Future runs will automatically compare against this benchmark

### Updating Your Benchmark

When you improve your config or want to reset the baseline:

1. Run evaluation with the updated setup
2. Review the new results
3. If satisfied, replace the benchmark:
   ```bash
   cp results/agent-eval-YYYY-MM-DDTHH-mm-ss.csv packages/core/eval/agent-eval/benchmark/agent-eval-benchmark.csv
   ```

**Note:** The benchmark file is not in version control - each environment maintains its own baseline.
