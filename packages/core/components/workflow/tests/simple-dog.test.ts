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

    console.log("\n[DOG] Retrieving API documentation");
    // await orchestrator.retrieveApiDocumentation(baseApiInput.documentationUrl);

    const manualExecutionPlan: ExecutionPlan = {
      id: `manual-plan-${Date.now()}`,
      apiHost: dogApiHost,
      steps: [
        {
          id: "getAllBreeds",
          endpoint: "/breeds/list/all",
          instruction: "Get all dog breeds",
          executionMode: "DIRECT",
          outputIsArray: true,
          responseField: "message", // The Dog API wraps response in a message field
          objectKeysAsArray: true,  // We want to use the keys of the message object as breeds
        },
        {
          id: "getBreedImage",
          endpoint: "/breed/${breed}/images/random",
          instruction: "Get a random image for a specific dog breed",
          dependencies: ["getAllBreeds"],
          executionMode: "LOOP",
          loopVariable: "breed", // Explicitly specify which variable to loop over
          loopMaxIters: 5,
        },
      ],
      finalTransform: `{
      "breeds": $map(
        $filter(
          $keys($.getAllBreeds),
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

    // Set step mappings
    await orchestrator.setStepMapping(planId, "getAllBreeds", {
      inputMapping: "$",
      responseMapping: "$",
    });

    await orchestrator.setStepMapping(planId, "getBreedImage", {
      inputMapping: "$", // Use identity mapping since loopVariable will handle extracting values
      responseMapping: "$",
    });

    const payload = {};
    const credentials = {};

    console.log("\n[DOG] Executing workflow plan");
    const result = await orchestrator.executeWorkflowPlan(planId, payload, credentials);
    
    expect(result.success).toBe(true);
    
    // Expected output structure 
    const expectedStructure = {
      breeds: [
        {
          affenpinscher: "https://images.dog.ceo/breeds/hound-afghan/n02088094_357.jpg"
        }
        // More breeds would follow in the real result
      ]
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
      console.log(JSON.stringify({
        breeds: [data.breeds[0]]
      }, null, 2));
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
