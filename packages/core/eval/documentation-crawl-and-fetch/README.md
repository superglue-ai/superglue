# Documentation Crawl and Fetch Evaluation

Evaluates the quality of documentation crawling and retrieval across multiple API documentation sites using advanced RAG (Retrieval-Augmented Generation) metrics.

## What It Does

1. **Phase 1 - Documentation Fetching**: Uses the `Documentation` class to crawl and store docs from API sites
2. **Phase 2 - RAG Evaluation**: Tests retrieval quality using AI-generated search queries and comprehensive scoring
3. **Advanced Metrics**: Measures relevance, completeness, accuracy, and overall RAG performance
4. **Debug Logging**: Generates detailed CSV files with all evaluation data for analysis

## How to Run

```bash
# Run documentation evaluations
cd packages/core && npm run build && node dist/eval/documentation-crawl-and-fetch/run-documentation-evaluations.js 
```

## Configuration

Edit `config/doc-eval-config.json` to add/remove sites and test questions:

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
        "What are the required fields for creating a payment intent?",
        "How do I handle webhook events in Stripe?",
        "What authentication methods does Stripe API support?",
        "How do I list all charges for a customer?"
      ]
    }
  ],
  "settings": {
    "crawlTimeout": 30000,
    "maxDocumentationSize": 9000000,
    "enablePlaywright": true,
    "enableOpenApi": true
  }
}
```

## Output

The evaluation runs in two phases with detailed logging and CSV debug files:

```
🚀 Starting Documentation Evaluation Pipeline
📥 Phase 1: Documentation Fetching
✅ Stripe API: 1.39MB, OpenAPI: 6966KB
📊 Fetch Summary: 1/1 sites (100.0%)
📚 Documentation: 1.4MB total, 1.39MB avg per site

📝 Phase 2: Documentation Evaluation
📄 Debug CSV log initialized: evaluation-debug-2025-10-06T14-00-18-638Z.csv
📝 Stripe API: 5/5 questions (100.0%) - Avg RAG: 61.6%
📊 Evaluation Summary: 5/5 questions answered (100.0%)
🎯 RAG Scores - Overall: 61.6%, Relevance: 76.0%, Completeness: 48.0%, Accuracy: 82.0%
📄 Detailed evaluation results saved to: evaluation-debug-2025-10-06T14-00-18-638Z.csv
```

## Debug CSV Output

Each evaluation generates a timestamped CSV file with detailed results:

| Column | Description |
|--------|-------------|
| `timestamp` | When the evaluation occurred |
| `siteId` | Site identifier |
| `question` | Original test question |
| `searchQuery` | AI-generated search query |
| `searchResultsSizeKB` | Size of retrieved content |
| `searchResultsPreview` | First 2000 chars of retrieved content |
| `ragScore` | Overall RAG score (0-100) |
| `relevanceScore` | Relevance score (0-100) |
| `completenessScore` | Completeness score (0-100) |
| `accuracyScore` | Accuracy score (0-100) |