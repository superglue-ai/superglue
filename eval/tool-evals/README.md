# Tool Evaluation Framework

Automated testing framework for Superglue's tool builder and executor across multiple API integrations.

## Quick Start

**Entry point:** `index.ts` - Run the evaluation suite

1. **Set up config**

   Edit your config file at `data/agent-eval-config.json`

2. **Add credentials**

   Add your API credentials to root `.env` or as environment variables (see [Credentials Setup](#credentials-setup) for naming rules)

3. **Add benchmark (optional)**

   Copy your benchmark file to `data/benchmark/agent-eval-benchmark.csv` (see [Benchmarking](#benchmarking) for details)

4. **Run evaluation**

   ```bash
   npm run test:agent-eval
   ```

5. **View results**

   - Console output shows immediate results
   - `data/results/` folder contains timestamped CSV, JSON, and Markdown reports

## Project Structure

```
tool-evals/
├── index.ts              # Main entry point
├── types.ts              # Shared type definitions
├── config/               # Configuration loading
│   └── config-loader.ts
├── services/             # Core business logic
│   ├── integration-setup.ts
│   ├── tool-runner.ts
│   ├── tool-attempt.ts
│   ├── metrics-calculator.ts
│   └── metrics-comparer.ts
├── reporters/            # Output formatting (strategy pattern)
│   ├── console-reporter.ts
│   ├── csv-reporter.ts
│   ├── json-reporter.ts
│   └── markdown-reporter.ts
├── utils/                # Utility functions
│   └── utils.ts
└── data/                 # Config files and outputs
    ├── agent-eval-config.json
    ├── benchmark/
    └── results/
```

## Configuration

### Config File Structure

The `data/agent-eval-config.json` defines integrations and tools:

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
  "tools": [
    {
      "id": "my-tool",
      "name": "My Tool",
      "type": "retrieval",
      "instruction": "Get all users from MyAPI",
      "integrationIds": ["myapi"],
      "expectedData": {
        "users": []
      }
    }
  ],
  "enabledTools": "all",
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

- `tools`: Array of test tools
  - `instruction`: Natural language description of what to do
  - `integrationIds`: Which integration(s) to use
  - `expectedData`: Optional validation data
  - `type`: `"retrieval"`, `"action"`, or `"upsert"`

- `enabledTools`: `"all"` or array of tool IDs to run

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
2. Review results in the `data/results/` folder
3. Copy a good run to use as your baseline:
   ```bash
   cp data/results/agent-eval-YYYY-MM-DDTHH-mm-ss.csv data/benchmark/agent-eval-benchmark.csv
   ```
4. Future runs will automatically compare against this benchmark

### Updating Your Benchmark

When you improve your config or want to reset the baseline:

1. Run evaluation with the updated setup
2. Review the new results
3. If satisfied, replace the benchmark:
   ```bash
   cp data/results/agent-eval-YYYY-MM-DDTHH-mm-ss.csv data/benchmark/agent-eval-benchmark.csv
   ```

**Note:** The benchmark file is not in version control - each environment maintains its own baseline.
