# Tool Evaluation Framework

Tests Superglue's tool builder and executor against real API integrations. Validates that the AI agent can correctly build and execute tools for various APIs.

## What It Tests

The framework validates:
- **Tool Building**: Can the agent create working API tools from natural language instructions?
- **Execution**: Do the built tools successfully call APIs and return data?
- **Self-Healing**: Can tools recover from errors through retries?
- **Determinism**: Do repeated builds produce consistent results?

Two test modes:
- **One-Shot**: Build and execute without retries (tests first-attempt success)
- **Self-Healing**: Build with error recovery enabled (tests resilience)

## Running Tests

From project root:
```bash
npm run test:tool-eval
```

## Required Setup

### 1. Environment Variables

Add API credentials to root `.env` file using the pattern: `{INTEGRATION_ID}_{CREDENTIAL_KEY}`

Example for integration `id: "stripe"` with credential `api_key`:
```bash
STRIPE_API_KEY=sk_test_abc123...
```

**Current test integrations:**
```bash
# Project Management
CLICKUP_API_TOKEN=<your_token>
LINEAR_API_KEY=<your_key>
JIRA_EMAIL=<your_email>
JIRA_API_TOKEN=<your_token>
TRELLO_API_KEY=<your_key>
ASANA_API_KEY=<your_key>

# CRM & Communication
ATTIO_API_TOKEN=<your_token>
HUBSPOT_APP_TOKEN=<your_token>
SLACK_BOT_TOKEN=<your_token>

# Data & Storage
AIRTABLE_API_KEY=<your_key>
POSTGRES_LEGO_USERNAME=<username>
POSTGRES_LEGO_PASSWORD=<password>
POSTGRES_LEGO_HOST=<host>
POSTGRES_LEGO_PORT=5432
POSTGRES_LEGO_DATABASE=<database>

# Payments & Forms
STRIPE_API_KEY=<your_key>
TYPEFORM_PERSONAL_ACCESS_TOKEN=<your_token>

# Time & Documentation
CLOCKIFY_API_KEY=<your_key>
CONFLUENCE_EMAIL=<your_email>
CONFLUENCE_API_TOKEN=<your_token>
GITHUB_API_TOKEN=<your_token>
```

### 2. Configuration File

Edit `eval/tool-evals/tool-eval-config.json` to define integrations and test tools.

## Viewing Results

Results are written to `eval/tool-evals/data/results/` with timestamp:

- **CSV**: `tool-eval-YYYY-MM-DDTHH-mm-ss.csv` - Tabular results for analysis
- **JSON**: `tool-eval-YYYY-MM-DDTHH-mm-ss.json` - Full structured data
- **Markdown**: `tool-eval-YYYY-MM-DDTHH-mm-ss.md` - Human-readable report
- **Console**: Live output during test run

### Key Metrics
- **Success Rate**: % of tools that executed successfully
- **Build Success**: % of tools that built without errors
- **Execution Success**: % of built tools that ran successfully
- **Validation Pass**: % that passed data validation (if configured)
- **Average Attempts**: Mean attempts needed to succeed

## Adding New Tests

### Basic Test
Add to `tool-eval-config.json`:

```json
{
  "integrations": [{
    "id": "myapi",
    "name": "My API",
    "urlHost": "https://api.myapi.com",
    "documentationUrl": "https://docs.myapi.com/api",
    "credentials": {
      "api_key": ""
    }
  }],
  "tools": [{
    "id": "myapi-get-users",
    "name": "Get Users",
    "type": "retrieval",
    "instruction": "Fetch all users from My API",
    "integrationIds": ["myapi"]
  }]
}
```

Then add env var: `MYAPI_API_KEY=<your_key>`

### Test with Validation

Add `expectedData` and optional `skipValidation`:

```json
{
  "id": "myapi-get-users",
  "instruction": "Fetch all users",
  "integrationIds": ["myapi"],
  "expectedData": {
    "users": [],
    "total": 0
  },
  "skipValidation": ["users[0].id", "total"]
}
```

**skipValidation** excludes fields from validation:
- Useful for dynamic data (IDs, timestamps, counts)
- Uses JSONPath syntax
- Array syntax: `users[0].id` skips ID in first user
- Wildcard: `users[*].id` skips all user IDs

Without `skipValidation`, exact values would be compared.
