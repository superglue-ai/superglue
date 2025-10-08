import { config } from 'dotenv';
import path from 'path';
import { DocumentationEvalFetcher } from './utils/doc-eval-fetcher.js';
import { DocumentationEvaluator } from './utils/doc-eval-retrieval-evaulator.js';
import { DocumentationEvaluationConfigLoader } from './utils/doc-eval-config-loader.js';
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
    
    const config = await configLoader.loadConfig();
    const sitesToUse = configLoader.getEnabledSites(config);
    
    const datastore = createDataStore({ type: 'postgres' });
    
    logMessage('info', '\n📥 Phase 1: Documentation Fetching', metadata);
    const fetcher = new DocumentationEvalFetcher(datastore, ORG_ID);
    await fetcher.fetchAllDocumentation(sitesToUse);
    
    logMessage('info', '\n📝 Phase 2: Documentation Evaluation', metadata);
    const evaluator = new DocumentationEvaluator(datastore, ORG_ID);
    await evaluator.evaluateAllSites(sitesToUse);
    
    await fetcher.cleanup();
    
    logMessage('info', '\n🎉 Pipeline completed successfully', metadata);
    
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