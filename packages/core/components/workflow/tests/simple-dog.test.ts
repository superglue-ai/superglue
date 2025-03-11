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
          id: "getBreedImage",
          endpoint: "/breed/${breed}/images/random",
          method: HttpMethod.GET,
          description: "Get a random image for a specific dog breed",
          dependencies: ["getAllBreeds"]
        },
      ],
      finalTransform: `{
        "breeds": $map($keys(getAllBreeds.message), function($breed, $index) {
          {
            $breed: getBreedImage[$index].message
          }
        })
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

    await orchestrator.setStepMapping(planId, "getBreedImage", {
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

    // Assertions
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.breeds).toBeDefined();
    expect(Array.isArray(result.data.breeds)).toBe(true);
    expect(Object.values(result.data.breeds[0])[0]).toBeDefined();
    expect(typeof Object.values(result.data.breeds[0])[0]).toBe("string");

    // Step results should exist and be successful
    expect(result.stepResults).toBeDefined();
    expect(result.stepResults.getAllBreeds).toBeDefined();
    expect(result.stepResults.getAllBreeds.success).toBe(true);
  });
});
