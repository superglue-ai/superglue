import { startApiServer } from './api/api-server.js';
import { createDataStore } from './datastore/datastore.js';
import { startGraphqlServer } from './graphql/graphql-server.js';
import { WorkflowSchedulerWorker } from './scheduler/scheduler-worker.js';
import { validateEnvironment } from './shared/environment.js';
async function startServer() {
  validateEnvironment();

  // Initialize shared components
  const datastore = createDataStore({ 
    type: String(process.env.DATASTORE_TYPE).toLowerCase() as 'redis' | 'memory' | 'file' | 'postgres' 
  });

  if (process.env.START_SCHEDULER_SERVER === 'true') {
    const workflowScheduler = new WorkflowSchedulerWorker(datastore);
    workflowScheduler.start();
  }

  await Promise.all([
    startApiServer(datastore),
    startGraphqlServer(datastore)
  ]);
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});