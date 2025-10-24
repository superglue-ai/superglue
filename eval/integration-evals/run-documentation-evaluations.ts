import { config } from 'dotenv';
import path from 'path';
import { DocumentationEvalFetcher } from './utils/doc-eval-fetcher.js';
import { DocumentationEvaluator } from './utils/doc-eval-retrieval-evaulator.js';
import { DocumentationEvaluationConfigLoader } from './utils/doc-eval-config-loader.js';
import { BenchmarkComparer } from './utils/benchmark-comparer.js';
import { createDataStore } from '../../packages/core/datastore/datastore.js';
import { logMessage } from '../../packages/core/utils/logs.js';

// Load environment variables
const envPath = process.cwd().endsWith('packages/core')
  ? path.join(process.cwd(), '../../.env')
  : path.join(process.cwd(), '.env');
config({ path: envPath });

/**
 * Main entry point for documentation evaluation pipeline
 */
async function main() {
  const configLoader = new DocumentationEvaluationConfigLoader();
  const ORG_ID = 'documentation-eval';
  const metadata = { orgId: ORG_ID, userId: 'system' };
  
  try {
    logMessage('info', '🚀 Starting Documentation Evaluation Pipeline', metadata);
    
    const evalConfig = await configLoader.loadConfig();
    const sitesToUse = configLoader.getEnabledSites(evalConfig);
    
    const datastore = createDataStore({ type: 'postgres' });
    
    const isCompiledDist = import.meta.url.includes('/dist/');
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const benchmarkDir = isCompiledDist 
      ? path.join(scriptDir, '../../../eval/documentation-crawl-and-fetch/benchmark')
      : path.join(scriptDir, 'benchmark');
    const comparer = new BenchmarkComparer(benchmarkDir);
    
    logMessage('info', '\n📥 Phase 1: Documentation Fetching', metadata);
    const fetcher = new DocumentationEvalFetcher(datastore, ORG_ID);
    const { csvPath: fetchCsvPath } = await fetcher.fetchAllDocumentation(sitesToUse);
    
    logMessage('info', '\n📝 Phase 2: Documentation Evaluation', metadata);
    const evaluator = new DocumentationEvaluator(datastore, ORG_ID);
    await evaluator.evaluateAllSites(sitesToUse);
    
    await fetcher.cleanup();
    
    logMessage('info', '\n🎉 Pipeline completed successfully', metadata);
    
    // Compare against benchmark
    comparer.compareFetchResults(fetchCsvPath);
    comparer.compareEvalResults(evaluator.getCsvPath());
    
  } catch (error) {
    logMessage('error', `❌ Pipeline failed: ${error}`, metadata);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logMessage('error', `Unhandled error in main: ${error}`, { orgId: 'documentation-eval', userId: 'system' });
    process.exit(1);
  });
}

export { main };