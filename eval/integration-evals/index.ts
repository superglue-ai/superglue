import { main as runDocumentationEvaluations } from "./run-documentation-evaluations.js";

async function main(): Promise<void> {
  await runDocumentationEvaluations();
}

main().catch((error) => {
  console.error("integration-evals failed:", error);
  process.exit(1);
});

export { main };


