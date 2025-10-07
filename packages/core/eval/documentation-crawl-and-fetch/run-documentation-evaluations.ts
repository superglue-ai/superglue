import { config } from 'dotenv';
import path from 'path';
import { DocumentationFetcher } from './utils/documentation-fetcher.js';
import { DocumentationEvaluator } from './utils/documentation-evaluator.js';
import { DocumentationEvaluationConfigLoader } from './utils/config-loader.js';
import { createDataStore } from '../../datastore/datastore.js';
import { logMessage } from '../../utils/logs.js';

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
    
    // Load configuration
    const config = await configLoader.loadConfig();
    const sitesToUse = configLoader.getEnabledSites(config);
    
    // Initialize datastore
    const datastore = createDataStore({ type: 'postgres' });
    
    // Phase 1: Fetch Documentation
    logMessage('info', '📥 Phase 1: Documentation Fetching', metadata);
    const fetcher = new DocumentationFetcher(datastore, ORG_ID);
    const fetchSummary = await fetcher.fetchAllDocumentation(sitesToUse);
    
    // Phase 2: Evaluate Documentation
    logMessage('info', '📝 Phase 2: Documentation Evaluation', metadata);
    const evaluator = new DocumentationEvaluator(datastore, ORG_ID);
    const evaluationSummary = await evaluator.evaluateAllSites(sitesToUse);
    
    // Final Summary
    logMessage('info', '📊 Final Summary', metadata);
    logMessage('info', `✅ Documentation: ${fetchSummary.successfulFetches}/${fetchSummary.totalSites} sites fetched`, metadata);
    logMessage('info', `✅ Evaluation: ${evaluationSummary.questionsAnswered}/${evaluationSummary.totalQuestions} questions answered`, metadata);
    
    // Cleanup
    await fetcher.cleanup();
    
    logMessage('info', '🎉 Pipeline completed successfully', metadata);
    
  } catch (error) {
    logMessage('error', `❌ Pipeline failed: ${error}`, metadata);
    process.exit(1);
  }
  
  // Ensure process exits cleanly
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