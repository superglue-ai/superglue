# Documentation Crawl and Fetch Evaluation

Evaluates the quality of documentation crawling across multiple API documentation sites. Tests how well the crawler fetches and processes documentation from various sources.

## What It Does

1. **Crawls Documentation**: Uses the `Documentation` class to fetch docs from multiple API sites
2. **Tests Different Sources**: Stripe, GitHub, Slack, Twilio, Shopify APIs
3. **Measures Quality**: Success rates, crawl times, documentation sizes
4. **Stores Results**: Saves crawled docs for future retrieval testing

## How to Run

```bash
# Run documentation evaluations
cd packages/core && npm run build && node dist/eval/documentation-crawl-and-fetch/run-documentation-evaluations.js 
```

## Configuration

Edit `config/doc-eval-config.json` to add/remove sites:

```json
{
  "sites": [
    {
      "id": "stripe-api",
      "name": "Stripe API",
      "documentationUrl": "https://stripe.com/docs/api",
      "openApiUrl": "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
      "urlHost": "https://api.stripe.com",
      "keywords": ["payment", "charge", "customer"],
      "testQuestions": [
        "How do I create a new customer in Stripe?",
        "What are the required fields for creating a payment intent?"
      ]
    }
  ]
}
```

## Output

```
🚀 Starting Documentation Crawl and Fetch Evaluation...
📋 Loaded configuration for 5 sites
🔍 Evaluating site: Stripe API (stripe-api)
✅ Completed Stripe API: SUCCESS (245KB, 15234ms)
📊 Success Rate: 80.0%, Total Time: 45678ms
```