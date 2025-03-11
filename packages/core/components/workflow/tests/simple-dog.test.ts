import { HttpMethod } from "@superglue/shared";
import { describe, expect, it } from "vitest";
import { ApiWorkflowOrchestrator } from "../apiWorkflowOrchestrator.js";
import type { ExecutionPlan } from "../domain/workflow.types.js";

describe("ApiWorkflowOrchestrator-dog", { timeout: 600000 }, () => {
  it("should execute a manual workflow plan successfully", async () => {
    // Create orchestrator with baseApiInput for JSONPlaceholder API
    const jsonPlaceholderHost = "https://dog.ceo/api";
    const baseApiInput = {
      urlHost: jsonPlaceholderHost,
      method: HttpMethod.GET,
      instruction: "Get a link to a picture for all dog breeds",
      documentationUrl: "https://dog.ceo/dog-api/documentation",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    const orchestrator = new ApiWorkflowOrchestrator(baseApiInput);

    // Retrieve API documentation
    await orchestrator.retrieveApiDocumentation(baseApiInput.documentationUrl);
    console.log("API Docs: ", orchestrator.getApiDocumentation());

    const manualExecutionPlan: ExecutionPlan = {
      id: `manual-plan-${Date.now()}`,
      apiHost: jsonPlaceholderHost,
      steps: [
        {
          id: "getAllBreeds",
          endpoint: "/breeds/list/all",
          method: HttpMethod.GET,
          description: "Get all dog breeds",
        },
        {
          id: "getRandomBreedImage",
          endpoint: "/breed/${breed}/images/random",
          method: HttpMethod.GET,
          description: "Get a random breed image",
          dependencies: ["getAllBreeds"],
        },
      ],
      finalTransform: `{
        "breeds": getAllBreeds,
        "randomBreedImage": getRandomBreedImage[breed=getAllBreeds.breeds]
      }`,
    };

    // Register the execution plan
    const planId = await orchestrator.registerExecutionPlan(manualExecutionPlan);

    // Set step mappings
    await orchestrator.setStepMapping(planId, "getAllBreeds", {
      inputMapping: "{}",
      responseMapping: "$",
    });

    await orchestrator.setStepMapping(planId, "getRandomBreedImage", {
      inputMapping: '{ "breed": $.previousSteps.getAllBreeds.breeds }',
      responseMapping: "$",
    });

    await orchestrator.setStepMapping(planId, "createPost", {
      inputMapping: `{ 
        "userId": $.previousSteps.getUserData.id, 
        "title": "New Post", 
        "body": "This is a test post created by the workflow"
      }`,
      responseMapping: "$",
    });

    // Execute the workflow
    const payload = {}; // Empty initial payload
    const credentials = {}; // No credentials needed for jsonplaceholder

    // Execute and get the result
    const result = await orchestrator.executeWorkflowPlan(planId, payload, credentials);

    console.log("Workflow execution completed successfully!");
    console.log("Final result:", JSON.stringify(result.data, null, 2));

    // Show step results
    console.log("\nStep results:");
    for (const [stepId, stepResult] of Object.entries(result.stepResults)) {
      console.log(`\nStep: ${stepId}`);
      console.log(`Success: ${stepResult.success}`);
      if (stepResult.transformedData) {
        console.log("Transformed data:", JSON.stringify(stepResult.transformedData, null, 2));
      }
      if (stepResult.error) {
        console.log("Error:", stepResult.error);
      }
    }
    console.log("Result:", result);

    // Assertions
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.user).toBeDefined();
    expect(result.data.user?.id).toBe(1);
    expect(result.data.posts).toBeDefined();
    expect(Array.isArray(result.data.posts)).toBe(true);
    expect(result.data.newPost).toBeDefined();
    expect(result.data.newPost?.userId).toBe(1);
    expect(result.data.newPost?.title).toBe("New Post");

    // Step results should exist and be successful
    expect(result.stepResults).toBeDefined();
    expect(result.stepResults.getUserData).toBeDefined();
    expect(result.stepResults.getUserData.success).toBe(true);
    expect(result.stepResults.getUserPosts).toBeDefined();
    expect(result.stepResults.getUserPosts.success).toBe(true);
    expect(result.stepResults.createPost).toBeDefined();
    expect(result.stepResults.createPost.success).toBe(true);
  });
});
