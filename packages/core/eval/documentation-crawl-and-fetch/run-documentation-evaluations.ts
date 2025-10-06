import { config } from 'dotenv';
import path from 'path';
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
 * Main entry point for running documentation crawl and fetch evaluation
 */
async function main() {
  const configLoader = new DocumentationEvaluationConfigLoader();
  const ORG_ID = 'documentation-eval';
  const metadata = { orgId: ORG_ID, userId: 'system' };
  
  try {
    logMessage('info', '🚀 Starting Documentation Crawl and Fetch Evaluation...', metadata);
    
    const config = await configLoader.loadConfig();
    
    // Initialize PostgreSQL datastore
    const datastore = createDataStore({ type: 'postgres' });
    
    const evaluator = new DocumentationEvaluator(datastore, ORG_ID);
    const suite = await evaluator.runEvaluation(config);
    
    await evaluator.cleanup();
    
    logMessage('info', 'Evaluation completed', metadata);
    
  } catch (error) {
    logMessage('error', `❌ Evaluation failed: ${error}`, metadata);
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
