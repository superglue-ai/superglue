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

Edit `config.json` to:
- Enable/disable workflows
- Set expected data for validation
- Define integrations and their credentials

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