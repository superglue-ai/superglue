import { startApiServer } from './servers/api-server.js';
import { startGraphqlServer } from './servers/graphql-server.js';
import { validateEnvironment } from './shared/environment.js';

// Determine which server to start based on environment or command line args
const serverType = process.env.SERVER_TYPE || process.argv[2] || 'api';

async function startServer() {
  validateEnvironment();

  if (serverType === 'api') {
    await startApiServer();
  } else {
    await startGraphqlServer();
  }
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});