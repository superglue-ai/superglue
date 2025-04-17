/*
import { HttpMethod } from "@superglue/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tools from "../utils/tools.js";
import { ApiWorkflowOrchestrator } from "./workflow.js";
import type { ExecutionPlan } from "./workflow.types.js";
import * as workflowUtils from "./workflowUtils.js";

// Mock openai so that we don't have to use API keys to run the test
vi.mock("openai", () => {
  const mockCompletionsCreate = vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            jsonata: '{ "test": "data" }',
            confidence: 95,
            confidence_reasoning: "Test reasoning",
          }),
        },
      },
    ],
  });

  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCompletionsCreate,
        },
      };
    },
  };
});

describe("ApiWorkflowOrchestrator Integration Tests", { timeout: 30000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the executeApiCall function to return test data
    vi.spyOn(workflowUtils, "executeApiCall").mockImplementation((apiConfig) => {
      if (apiConfig.urlPath === "/users/1") {
        return Promise.resolve({ id: 1, username: "testUser", name: "Test User" });
      }
      if (apiConfig.urlPath.includes("/posts")) {
        return Promise.resolve([
          { id: 1, title: "Post 1", body: "Content 1" },
          { id: 2, title: "Post 2", body: "Content 2" },
        ]);
      }
      if (apiConfig.urlPath === "/breeds/list/all") {
        return Promise.resolve({
          message: {
            affenpinscher: [],
            african: [],
            airedale: [],
            akita: [],
            appenzeller: ["breed2"],
          },
          status: "success",
        });
      }
      if (apiConfig.urlPath.includes("/breed/")) {
        const breed = apiConfig.urlPath.split("/")[2];
        return Promise.resolve({
          message: `https://images.dog.ceo/breeds/${breed}/sample.jpg`,
          status: "success",
        });
      }
      return Promise.resolve(null);
    });
  });

  it("should execute a simple workflow with multiple steps", async () => {
    // Prepare the expected data structure
    const userData = {
      id: 1,
      username: "testUser",
      name: "Test User",
    };

    const userPosts = [
      { id: 1, title: "Post 1", body: "Content 1" },
      { id: 2, title: "Post 2", body: "Content 2" },
    ];

    const expectedFinalData = {
      user: userData,
      posts: userPosts,
      summary: {
        username: "testUser",
        postCount: 2,
      },
    };

    // Mock the executeApiCall function
    const executeApiCallMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(userData))
      .mockImplementationOnce(() => Promise.resolve(userPosts));

    vi.spyOn(workflowUtils, "executeApiCall").mockImplementation(executeApiCallMock);

    const baseApiInput = {
      urlHost: "https://jsonplaceholder.typicode.com",
      method: HttpMethod.GET,
      instruction: "Base configuration for JSONPlaceholder API",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    const orchestrator = new ApiWorkflowOrchestrator(baseApiInput);

    const plan: ExecutionPlan = {
      id: "simple_integration_plan",
      steps: [
        {
          id: "getUser",
          apiConfig: {
            urlPath: "/users/1",
            method: HttpMethod.GET,
            urlHost: "https://jsonplaceholder.typicode.com",
            instruction: "Get user with ID 1",
            id: "api_config_getUser",
          },
          executionMode: "DIRECT",
          inputMapping: "$",
          responseMapping: "$",
        },
        {
          id: "getUserPosts",
          apiConfig: {
            urlPath: "/posts?userId={userId}",
            method: HttpMethod.GET,
            urlHost: "https://jsonplaceholder.typicode.com",
            instruction: "Get posts for the user",
            id: "api_config_getUserPosts",
          },
          executionMode: "DIRECT",
          inputMapping: "{ userId: $.getUser.id }",
          responseMapping: "$",
        },
      ],
      finalTransform: `{
        "user": $.getUser,
        "posts": $.getUserPosts,
        "summary": {
          "username": $.getUser.username,
          "postCount": $count($.getUserPosts)
        }
      }`,
    };

    const planId = await orchestrator.registerExecutionPlan(plan);

    const result = await orchestrator.executeWorkflowPlan(planId, {}, {});

    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveProperty("getUser");
    expect(result.stepResults).toHaveProperty("getUserPosts");
    expect(result.stepResults.getUser.success).toBe(true);
    expect(result.stepResults.getUserPosts.success).toBe(true);

    type ResultData = {
      user: { id: number; username: string };
      posts: Array<{ id: number; title: string; body: string }>;
      summary: { username: string; postCount: number };
    };

    const typedData = result.data as ResultData;

    expect(typedData).toHaveProperty("user");
    expect(typedData).toHaveProperty("posts");
    expect(typedData).toHaveProperty("summary");
    expect(typedData.user).toHaveProperty("id", 1);
    expect(typedData.user).toHaveProperty("username", "testUser");
    expect(Array.isArray(typedData.posts)).toBe(true);
    expect(typedData.posts.length).toBe(2);
    expect(typedData.summary.username).toBe("testUser");
    expect(typedData.summary.postCount).toBe(2);
  });

  it("should correctly transform dog breed data with images", async () => {
    // Mock all tools functions
    vi.spyOn(tools, "applyJsonata").mockImplementation((data, expression) => {
      // If the expression is the final transform, return our expected structure
      if (expression?.includes("breeds")) {
        return Promise.resolve({
          breeds: [
            { affenpinscher: "https://images.dog.ceo/breeds/affenpinscher/n02110627_4130.jpg" },
            { african: "https://images.dog.ceo/breeds/african/n02116738_9333.jpg" },
            { airedale: "https://images.dog.ceo/breeds/airedale/n02096051_910.jpg" },
            { akita: "https://images.dog.ceo/breeds/akita/Japaneseakita.jpg" },
            { appenzeller: "https://images.dog.ceo/breeds/appenzeller/n02107908_5002.jpg" },
          ],
        });
      }

      // For other expressions, passthrough handling
      if (expression === "$") {
        return Promise.resolve(data);
      }

      if (expression === "$keys($.message)") {
        return Promise.resolve(["affenpinscher", "african", "airedale", "akita", "appenzeller"]);
      }

      return Promise.resolve(data);
    });

    // Mock API calls
    vi.spyOn(workflowUtils, "executeApiCall").mockImplementation((apiConfig) => {
      if (apiConfig.urlPath === "/breeds/list/all") {
        return Promise.resolve({
          message: {
            affenpinscher: [],
            african: [],
            airedale: [],
            akita: [],
            appenzeller: [],
          },
          status: "success",
        });
      }

      // Handle breed image requests
      if (apiConfig.urlPath.startsWith("/breed/")) {
        const breed = apiConfig.urlPath.split("/")[2];
        return Promise.resolve({
          message: `https://images.dog.ceo/breeds/${breed}/sample.jpg`,
          status: "success",
        });
      }

      return Promise.resolve(null);
    });

    const baseApiInput = {
      urlHost: "https://dog.ceo/api",
      method: HttpMethod.GET,
      instruction: "Base configuration for Dog CEO API",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    const orchestrator = new ApiWorkflowOrchestrator(baseApiInput);

    // Exactly match the execution plan structure from simple-dog.test.ts
    const plan: ExecutionPlan = {
      id: "dog_breeds_transform_plan",
      steps: [
        {
          id: "getAllBreeds",
          apiConfig: {
            urlPath: "/breeds/list/all",
            instruction: "Get all dog breeds",
            method: HttpMethod.GET,
            urlHost: "https://dog.ceo/api",
            id: "getAllBreeds_apiConfig",
          },
          executionMode: "DIRECT",
          inputMapping: "$",
          responseMapping: "$keys($.message)", // Extract the keys (breed names) from the message object
        },
        {
          id: "getBreedImage",
          apiConfig: {
            urlPath: "/breed/{breed}/images/random",
            instruction: "Get a random image for a specific dog breed",
            method: HttpMethod.GET,
            urlHost: "https://dog.ceo/api",
            id: "getBreedImage_apiConfig",
          },
          executionMode: "LOOP",
          loopSelector: "breed", // Explicitly specify which variable to loop over
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

    const planId = await orchestrator.registerExecutionPlan(plan);
    const result = await orchestrator.executeWorkflowPlan(planId, {}, {});
    expect(result.success).toBe(true);

    const typedResult = result.data as {
      breeds: Array<Record<string, string>>;
    };

    expect(typedResult).toHaveProperty("breeds");
    expect(Array.isArray(typedResult.breeds)).toBe(true);
    expect(typedResult.breeds.length).toBe(5);

    const breedNames = ["affenpinscher", "african", "airedale", "akita", "appenzeller"];
    breedNames.forEach((breed, index) => {
      expect(typedResult.breeds[index]).toHaveProperty(breed);
      expect(typedResult.breeds[index][breed]).toContain(`https://images.dog.ceo/breeds/${breed}/`);
    });
  });
});

*/
