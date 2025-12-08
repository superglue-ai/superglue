import { workerData, parentPort } from "worker_threads";

const { taskModule } = workerData;
let run: (payload: any) => Promise<any>;

async function init() {
  const mod = await import(taskModule);
  if (typeof mod.run !== "function") {
    throw new Error(`Task module "${taskModule}" does not export a run() function`);
  }
  run = mod.run;
}

const ready = init();

// Piscina calls this for each job
export default async function (payload: any) {
  await ready;
  const result = await run(payload);
  parentPort?.postMessage({ type: 'logs_flushed', runId: payload.runId });
  return result;
}
