import { startApiServer } from "./api/api-server.js";
import { createDataStore } from "./datastore/datastore.js";
import { validateEnvironment } from "./shared/environment.js";
import { initializeWorkerPools } from "./worker/worker-pool-registry.js";

async function startServer() {
  validateEnvironment();

  const datastore = await createDataStore({ type: "postgres" });

  const workerPools = initializeWorkerPools(datastore);

  await startApiServer(datastore, workerPools);
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
