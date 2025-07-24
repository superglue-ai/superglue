# 🏆 The Agent-API Benchmark

> Which LLMs handle APIs best? Which APIs can agents actually work with?

## 🤔 Why This Benchmark Exists

AGI is coming. But is it? How good are agents really at doing things in production systems? And how well can they actually replace humans in doing mundane tasks in those systems?

This is the first version of the Agent-API Benchmark. In it, we're exploring how well agents can "do things" in production systems.

Current benchmarks tell you if a model can write Shakespeare or solve math problems. We don't care about that - we want to know **how reliably models work IRL**, in day-to-day work processes that we're claiming they'll automate. Whether that's accessing your CRM, your billing system, or in handling requests between those systems.

**We built this benchmark to explore how well agents can execute against APIs:**
- Which LLMs can reliably build working integrations into your tech stack?
- Which APIs are actually usable by agents?
- Where do agents fail, and why?
- What makes an API "agent-ready"?

## 🥇 Best LLMs for Building Integrations

Average success rate across all tested API integration tasks:

| Rank | LLM | Success Rate |
|------|-----|--------------|
| 1 | superglue¹ | 91% |
| 2 | Claude Sonnet 4 | 68% |
| 3 | Gemini 2.5 Flash | 67% |
| 4 | Claude Opus 4 | 65% |
| 5 | GPT-4.1 | 62% |
| 6 | O4 Mini | 56% |

¹ superglue is an integration layer designed specifically for agent-API integrations, not a general-purpose LLM

## 🏅 Best Agent-Ready APIs

Which APIs can agents figure out and use without human help?

**Sample prompts we tested:**
- **Slack:** "Find user ID by email, then send direct message"
- **JIRA:** "Get sprint issues, calculate completion %, identify blocked/high-priority items"
- **Notion:** "Query database, find duplicate emails, return count and list"

| Rank | API | Score | superglue | claude-4-sonnet | claude-4-opus | gpt-4.1 | o4-mini | gemini-2.5-flash |
|------|-----|-------|-----------|-----------------|---------------|---------|---------|------------------|
| 1 | Shopify | 1.00 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% |
| 2 | SendGrid | 1.00 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% |
| 3 | Zendesk | 1.00 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% |
| 4 | GitHub | 1.00 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% |
| 5 | Slack | 1.00 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% |
| 6 | JIRA | 1.00 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% |
| 7 | GitLab | 0.94 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 67% | ✅ 100% | ✅ 100% |
| 8 | Notion | 0.94 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 67% | ✅ 100% |
| 9 | Twilio | 0.94 | ✅ 67% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% |
| 10 | Stripe | 0.89 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ❌ 33% |
| 11 | HubSpot | 0.83 | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ❌ 33% | ✅ 67% |
| 12 | Huggingface | 0.78 | ✅ 100% | ✅ 100% | ❌ 0% | ✅ 100% | ✅ 67% | ✅ 100% |
| 13 | Discord | 0.50 | ✅ 100% | ❌ 0% | ✅ 100% | ❌ 0% | ✅ 67% | ❌ 33% |
| 14 | Airtable | 0.44 | ✅ 100% | ✅ 100% | ❌ 0% | ❌ 33% | ❌ 0% | ❌ 33% |
| 15 | Monday | 0.39 | ✅ 67% | ❌ 33% | ✅ 100% | ❌ 0% | ❌ 0% | ❌ 33% |
| 16 | Bitbucket | 0.39 | ❌ 33% | ❌ 0% | ❌ 0% | ✅ 67% | ❌ 33% | ✅ 100% |
| 17 | Square | 0.33 | ✅ 67% | ✅ 100% | ❌ 0% | ❌ 0% | ❌ 0% | ❌ 33% |
| 18 | PostHog | 0.22 | ✅ 67% | ❌ 0% | ✅ 67% | ❌ 0% | ❌ 0% | ❌ 0% |
| 19 | Attio | 0.22 | ✅ 100% | ❌ 0% | ❌ 0% | ❌ 0% | ❌ 0% | ❌ 33% |
| 20 | Asana | 0.22 | ✅ 100% | ❌ 0% | ❌ 0% | ❌ 33% | ❌ 0% | ❌ 0% |
| 21 | Snowflake | 0.22 | ✅ 100% | ❌ 0% | ❌ 0% | ❌ 0% | ❌ 0% | ❌ 33% |

## 📊 Key Findings

- **91% vs 56-68%:** Specialized agent platforms outperform general-purpose LLMs by 20-35 points
- **6 APIs achieved perfect scores** across all LLMs - Shopify, SendGrid, Zendesk, GitHub, Slack, and JIRA
- **Multi-step workflows expose weaknesses:** Performance drops significantly for complex APIs
- **Bottom tier APIs (Snowflake, Attio, Asana, PostHog)** struggle across all LLMs except superglue

## 🎯 What Makes APIs Agent-Ready

✅ **Clear endpoints:** `/users/123` not `/v2/entities?type=user&id=123`  
✅ **Standard auth:** OAuth, Bearer tokens, API keys in headers  
✅ **Real error messages:** "User not found" not "Error 1047"  
✅ **Consistent responses:** Same structure every time  
✅ **No custom query languages** or weird filters  

## 🔬 Methodology

**TL;DR:** We tested 21 APIs across 6 different LLMs.

Out of 630 integration attempts (21 APIs × 6 platforms × 5 attempts each):
- **23% failed** - The agent couldn't even complete basic tasks
- **Only 6 APIs worked 100% of the time** across all platforms
- **Custom query and request schemes are the biggest struggle**, they usually require careful planning and prompt engineering
- **superglue beats general-purpose LLMs by 30+ points** - purpose-built wins

### How We Test

#### Superglue Evaluation
1. Each workflow is run **5 times** to ensure consistency
2. For each attempt:
   - Build the workflow using LLM to generate API configurations
   - Execute the workflow and collect all logs
   - Track success/failure and timing metrics
   - Count API call failures from logs
3. Calculate metrics across all attempts:
   - Success rate (% of attempts that succeeded)
   - Average execution time (successful attempts only)
   - Total API call failures across all attempts

#### Direct LLM Evaluation
To compare Superglue's performance with direct LLM usage:

**Models tested:**
- **Claude Sonnet 4** (`claude-sonnet-4-20250514`)
- **Claude Opus 4** (`claude-opus-4-20250514`) 
- **GPT-4.1** (`gpt-4.1`)
- **O4 Mini** (`o4-mini`)
- **Gemini 2.5 Flash** (`gemini-2.5-flash`)

Each model is given:
- The same workflow instruction
- Integration details (API endpoints, credentials)
- A request to generate executable JavaScript code

The generated code is executed in a sandboxed Node.js environment with:
- Access to `fetch` for API calls
- The same credentials available
- A 60-second timeout

### Scoring System

```
Final Score = Average Success Rate (0-1) for each tested LLM
```

_Note: superglue is an integration layer designed specifically for agent-API integrations, not a general-purpose LLM. We included it to show the performance gap between specialized agent systems and general language models._

## 🚀 Running the Benchmark

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

### Configuration

The API ranking system is configured through `api-ranking-config.json`:

```json
{
  "settings": {
    "attemptsPerWorkflow": 5,        // Number of times to run each workflow
    "delayBetweenAttempts": 0        // Milliseconds between attempts (0 for dev, 1000-2000 for prod)
  },
  "workflowsToRank": [...],          // Array of workflow IDs to test
  "integrations": {...},             // API configurations with credentials
  "workflows": {...}                 // Workflow definitions with instructions
}
```

### Environment Variables

#### API Credentials
Required environment variables follow the pattern:
`{INTEGRATION_ID}_{CREDENTIAL_KEY}` (all uppercase, hyphens replaced with underscores)

All required keys:
`HUBSPOT_PRIVATE_APP_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `JIRA_API_TOKEN`, `JIRA_EMAIL`, `ATTIO_API_TOKEN`, `SUPABASE_PASSWORD`, `SUPABASE_PUBLIC_API_KEY`, `SUPABASE_SECRET_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `SENDGRID_API_KEY`, `POSTGRES_LEGO_CONNECTION_STRING`, `POSTHOG_API_KEY`, `GITHUB_API_KEY`, `GITLAB_API_KEY`, `SLACK_BOT_TOKEN`, `BITBUCKET_API_TOKEN`, `BITBUCKET_EMAIL`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `ASANA_PERSONAL_ACCESS_TOKEN`, `NOTION_INTERNAL_INTEGRATION_SECRET`, `HUGGINGFACE_ACCESS_TOKEN`, `MONDAY_PERSONAL_API_TOKEN`, `SQUARE_SANDBOX_ACCESS_TOKEN`, `ZENDESK_API_TOKEN`, `ZENDESK_EMAIL`, `AIRTABLE_PERSONAL_ACCESS_TOKEN`, `SNOWFLAKE_PERSONAL_ACCESS_TOKEN`, `SNOWFLAKE_USER_NAME`, `SNOWFLAKE_ACCOUNT`

#### LLM API Keys (Optional)
For direct LLM comparison:
- `OPENAI_API_KEY` - For GPT-4.1 and O4 Mini evaluation
- `ANTHROPIC_API_KEY` - For Claude Sonnet and Opus evaluation
- `GEMINI_API_KEY` - For Gemini evaluation

### Output

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

## 🤝 Contributing

All evaluation code is open source. Check out the full benchmark implementation on [GitHub](https://github.com/superglue-ai/superglue) to run your own tests or contribute new APIs.

### Adding New APIs

To add a new API to the ranking:
1. Add the integration configuration to `integrations` in the config
2. Add a test workflow to `workflows`
3. Add the workflow ID to `workflowsToRank`
4. Ensure environment variables are set for credentials

## 📬 See You in the Comments

We hope you found this helpful and would love to hear from you on [LinkedIn](https://linkedin.com/company/superglue-ai), [Twitter](https://twitter.com/superglue_d) and [GitHub](https://github.com/superglue-ai/superglue).

Connect with us via these channels for any inquiries: **hi@superglue.ai**

---

Made with ❤️ by the Superglue team