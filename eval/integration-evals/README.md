# Documentation Crawl and Fetch Evaluation

Evaluates the quality of documentation crawling and retrieval across multiple API documentation sites using advanced RAG (Retrieval-Augmented Generation) metrics.

## What It Does

1. **Phase 1 - Documentation Fetching**: Crawls and stores docs from API sites, tracks timing and sizes
2. **Phase 2 - RAG Evaluation**: Tests retrieval quality using AI-generated search queries and comprehensive scoring
3. **Metrics & CSV Export**: Detailed fetch metrics and evaluation results exported to CSV files

## How to Run

```bash
# TypeScript direct run
npm run test:integration-evals
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
        "What are the required fields for creating a payment intent?"
      ]
    }
  ]
}
```

## Output

Results are saved to the `results/` folder (gitignored) and compared against benchmarks in the `benchmark/` folder.

### Phase 1: Fetch Results Table

After fetching, a detailed table shows per-site metrics:

```
📊 Fetch Results Table:
═══════════════════════════════════════════════════════════════════════════════════
Site                      Pages*  Doc Size   OpenAPI  API Size  Doc s/pg  API Fetch
───────────────────────────────────────────────────────────────────────────────────
Stripe API                    19   1.39 MB       Yes    6796 KB      1.23      0.45s
GitHub API                    12   0.92 MB       Yes    3421 KB      1.87      0.32s
───────────────────────────────────────────────────────────────────────────────────
AVERAGE                       16   1.16 MB       2/2    5109 KB      1.55      0.39s
═══════════════════════════════════════════════════════════════════════════════════
* Page count estimated based on documentation size (~75KB/page average)

💾 Results saved to: results/fetch-results-2025-10-08T12-34-56-789Z.csv
```

**Fetch CSV Columns:**

- `Site`: Site name
- `Pages (estimated)`: Estimated page count based on size
- `Doc Size (MB)`: Total documentation size
- `Has OpenAPI`: Yes/No if OpenAPI spec exists
- `OpenAPI Size (KB)`: Size of OpenAPI spec
- `Doc Fetch (s/page)`: Average seconds per page for doc fetching
- `OpenAPI Fetch (s)`: Time to fetch OpenAPI spec

### Phase 2: Evaluation Results

```
📝 Phase 2: Documentation Evaluation
📝 Stripe API: 5/5 questions (100.0%) - Avg Retrieval: 76.0%
📊 Evaluation Summary: 5/5 questions answered (100.0%)
🎯 API Doc Scores - Retrieval: 76.0%, Endpoint: 82.0%, Completeness: 68.0%
📄 Detailed evaluation results saved to: results/evaluation-debug-2025-10-08T12-34-56-789Z.csv
```

**Evaluation CSV Columns:**

- `timestamp`, `siteId`, `siteName`: Metadata
- `question`, `searchQuery`: Question and generated search
- `searchResultsSizeKB`: Retrieved content size
- `retrievalScore`, `endpointScore`, `completenessScore`: Quality metrics (0-100)
- `reasoning`: AI explanation of scores

### Phase 3: Benchmark Comparison

After completing evaluation, results are automatically compared against baseline benchmarks:

```
Fetch Performance vs Benchmark:
═════════════════════════════════════════════════════════════════
📈 OpenAI API: Doc size +12.4%
═════════════════════════════════════════════════════════════════

Eval Quality vs Benchmark:
═════════════════════════════════════════════════════════════════
📈 Stripe API: Retrieval +18, Endpoint +12
📉 Claude API: Completeness -15
═════════════════════════════════════════════════════════════════
```

Only significant changes (>10% or >10 points) are reported. If no changes are significant, you'll see "✅ No significant changes from benchmark".

## Benchmark Management

Baseline files are stored in `benchmark/`:

- `fetch-results-baseline.csv` - Fetch performance baseline
- `evaluation-debug-baseline.csv` - Eval quality baseline

To update benchmarks after improvements:

```bash
cp results/fetch-results-<timestamp>.csv benchmark/fetch-results-baseline.csv
cp results/evaluation-debug-<timestamp>.csv benchmark/evaluation-debug-baseline.csv
```
