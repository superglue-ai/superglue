import { createDataStore } from './datastore/datastore.js';
import { startApiServer } from './servers/api-server.js';
import { startGraphqlServer } from './servers/graphql-server.js';
import { validateEnvironment } from './shared/environment.js';

async function startServer() {
  validateEnvironment();

  // Initialize shared components
  const datastore = createDataStore({ 
    type: String(process.env.DATASTORE_TYPE).toLowerCase() as 'redis' | 'memory' | 'file' | 'postgres' 
  });

  await Promise.all([
    startApiServer(datastore),
    startGraphqlServer(datastore)
  ]);
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});