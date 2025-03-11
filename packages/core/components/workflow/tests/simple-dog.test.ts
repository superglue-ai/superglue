import { HttpMethod } from "@superglue/shared";
import { describe, expect, it } from "vitest";
import { ApiWorkflowOrchestrator } from "../apiWorkflowOrchestrator.js";
import type { ExecutionPlan } from "../domain/workflow.types.js";

describe("ApiWorkflowOrchestrator-dog", { timeout: 600000 }, () => {
  it("should execute a manual workflow plan successfully", async () => {
    process.env = { ...process.env, ...require("dotenv").config({ path: ".env" }).parsed };

    // Create orchestrator with baseApiInput for Dog API
    const dogApiHost = "https://dog.ceo/api";
    const baseApiInput = {
      urlHost: dogApiHost,
      method: HttpMethod.GET,
      instruction: "Get a link to a single random picture for all dog breeds",
      documentationUrl: "https://dog.ceo/dog-api/documentation",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    const orchestrator = new ApiWorkflowOrchestrator(baseApiInput);

    // Retrieve API documentation
    console.log("\n📋 [Workflow] Retrieving API documentation");
    await orchestrator.retrieveApiDocumentation(baseApiInput.documentationUrl);

    console.log("\n📋 [Workflow] Creating execution plan");
    const manualExecutionPlan: ExecutionPlan = {
      id: `manual-plan-${Date.now()}`,
      apiHost: dogApiHost,
      steps: [
        {
          id: "getAllBreeds",
          endpoint: "/breeds/list/all",
          method: HttpMethod.GET,
          description: "Get all dog breeds",
        },
        {
          id: "getRandomImage",
          endpoint: "/breed/${breed}/images/random",
          method: HttpMethod.GET,
          description: "Get a random image for each dog breed",
          dependencies: ["getAllBreeds"],
        },
      ],
      finalTransform: `{
        "breeds": getAllBreeds,
        "randomImage": getRandomImage
      }`,
    };

    // Register the execution plan
    console.log("\n📋 [Workflow] Registering execution plan");
    const planId = await orchestrator.registerExecutionPlan(manualExecutionPlan);

    // Set step mappings
    await orchestrator.setStepMapping(planId, "getAllBreeds", {
      inputMapping: "$",
      responseMapping: "$",
    });

    await orchestrator.setStepMapping(planId, "getRandomImage", {
      inputMapping: "$",
      responseMapping: "$",
    });

    // Execute the workflow - providing the breed directly for this test
    // passes tests!: const payload = { "breed": "hound" };
    const payload = {};
    const credentials = {}; // No credentials needed for dog.ceo

    // Execute and get the result
    console.log("\n📋 [Workflow] Executing workflow plan");
    const result = await orchestrator.executeWorkflowPlan(planId, payload, credentials);
    console.log("Full result:", result);

    console.log("\n📋 [Workflow] Workflow completed successfully");
    console.log(
      "Final result:",
      JSON.stringify(
        {
          breeds: "Object with dog breeds",
          randomImage: result.data.randomImage,
        },
        null,
        2,
      ),
    );

    // Show key results only
    for (const [stepId, stepResult] of Object.entries(result.stepResults)) {
      if (stepId === "getRandomImage") {
        console.log(`\n🖼️ Random image URL: ${stepResult.transformedData}`);
      }
    }

    // Assertions
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.breeds).toBeDefined();
    expect(typeof result.data.breeds).toBe("object");
    expect(result.data.randomImage).toBeDefined();
    expect(typeof result.data.randomImage).toBe("string");

    // Step results should exist and be successful
    expect(result.stepResults).toBeDefined();
    expect(result.stepResults.getAllBreeds).toBeDefined();
    expect(result.stepResults.getAllBreeds.success).toBe(true);
    expect(result.stepResults.getRandomImage).toBeDefined();
    expect(result.stepResults.getRandomImage.success).toBe(true);
  });
});
