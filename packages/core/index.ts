import { startApiServer } from "./api/api-server.js";
import { createDataStore } from "./datastore/datastore.js";
import { startGraphqlServer } from "./graphql/graphql-server.js";
import { NotificationSummaryWorker } from "./scheduler/notification-summary-worker.js";
import { ToolSchedulerWorker } from "./scheduler/scheduler-worker.js";
import { validateEnvironment } from "./shared/environment.js";
import { initializeWorkerPools } from "./worker/worker-pool-registry.js";

async function startServer() {
  validateEnvironment();

  // Initialize shared components
  const datastore = createDataStore({
    type: String(process.env.DATASTORE_TYPE).toLowerCase() as "memory" | "file" | "postgres",
  });

  const workerPools = initializeWorkerPools(datastore);

  if (process.env.START_SCHEDULER_SERVER === "true") {
    const toolScheduler = new ToolSchedulerWorker(datastore, workerPools);
    toolScheduler.start();

    const notificationSummaryWorker = new NotificationSummaryWorker(datastore);
    notificationSummaryWorker.start();
  }

  await Promise.all([
    startApiServer(datastore, workerPools),
    startGraphqlServer(datastore, workerPools),
  ]);
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
