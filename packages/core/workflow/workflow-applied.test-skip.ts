import { HttpMethod } from "@superglue/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowExecutor } from "./workflow.js";

/*
describe("ApiWorkflowOrchestrator-dog", { timeout: 600000 }, () => {
  // Skip all tests when API key isn't available
  // if(!process.env.VITE_OPENAI_API_KEY) {
  //   it.skip('skips all tests when VITE_OPENAI_API_KEY is not set', () => {})
  //   return;
  // }
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test";
  }),
  it("should execute a manual workflow plan successfully", async () => {
    process.env = { ...process.env, ...require("dotenv").config({ path: ".env" }).parsed };

    const dogApiHost = "https://dog.ceo/api";
    const baseApiInput = {
      urlHost: dogApiHost,
      method: HttpMethod.GET,
      instruction: "Get a link to a single random picture for all dog breeds",
      documentationUrl: "https://dog.ceo/dog-api/documentation",
      headers: [{ key: "Content-Type", value: "application/json" }, { key: "Accept", value: "application/json" }],
    };
    const orchestrator = new WorkflowExecutor(baseApiInput);

    console.log("\n[DOG] Retrieving API documentation");
    // await orchestrator.retrieveApiDocumentation(baseApiInput.documentationUrl);

    const manualExecutionPlan: ExecutionPlan = {
      id: `manual-plan-${Date.now()}`,
      steps: [
        {
          id: "getAllBreeds",
          apiConfig: {
            urlPath: "/breeds/list/all",
            instruction: "Get all dog breeds", // UNUSED, just for later
            method: HttpMethod.GET,
            urlHost: dogApiHost,
            id: "getAllBreeds_apiConfig",
          },
          executionMode: "DIRECT",
          inputMapping: "$",
          responseMapping: "$keys($.message)", // Extract the keys (breed names) from the message object
        },
        {
          id: "getBreedImage",
          apiConfig: {
            urlPath: "/breed/{value}/images/random",
            instruction: "Get a random image for a specific dog breed", // UNUSED, just for later
            method: HttpMethod.GET,
            urlHost: dogApiHost,
            id: "getBreedImage_apiConfig",
          },
          executionMode: "LOOP",
          loopSelector: "getAllBreeds", // Explicitly specify which variable to loop over
          loopMaxIters: 5,
          inputMapping: "$", // Use identity mapping since loopSelector will handle extracting values
          responseMapping: "$",
        },
      ],
      finalTransform: `{
      "breeds": $map(
        $filter(
          $keys($.getAllBreeds.message),
          function($b) {
            $count($.getBreedImage[$split(message, "/")[4] = $b]) > 0
          }
        ),
        function($b) {
          {
            $b: $.getBreedImage[$split(message, "/")[4] = $b].message[0]
          }
        }
      )
    }`,
    };

    console.log("\n[DOG] Registering execution plan");
    const planId = await orchestrator.registerExecutionPlan(manualExecutionPlan);

    const payload = {};
    const credentials = {};

    console.log("\n[DOG] Executing workflow plan");
    const result = await orchestrator.executeWorkflowPlan(planId, payload, credentials);
    expect(result.success).toBe(true);
    // Expected output structure
    const expectedStructure = {
      breeds: [
        {
          affenpinscher: "https://images.dog.ceo/breeds/hound-afghan/n02088094_357.jpg",
        },
        // ... more breeds would follow in the real result
      ],
    };

    // Define the expected types for our data
    type BreedEntry = Record<string, string>;
    type ResultData = {
      breeds?: BreedEntry[];
    };
    const data = result.data as ResultData | undefined;

    // Log actual result for comparison
    console.log("Actual result structure (first breed):");
    if (data?.breeds && Array.isArray(data.breeds) && data.breeds.length > 0) {
      console.log(
        JSON.stringify(
          {
            breeds: [data.breeds[0]],
          },
          null,
          2,
        ),
      );
    }

    // Only assert the structure
    expect(data).toBeDefined();
    expect(Array.isArray(data?.breeds)).toBe(true);
    if (data?.breeds && data.breeds.length > 0) {
      const firstBreed = data.breeds[0];
      // Should be an object with exactly one key (the breed name)
      expect(typeof firstBreed).toBe("object");
      expect(Object.keys(firstBreed).length).toBe(1);
      // Get the breed name and image URL
      const breedName = Object.keys(firstBreed)[0];
      const imageUrl = firstBreed[breedName];
      // Image URL should be a string
      expect(typeof imageUrl).toBe("string");
    }
  });
});
*/