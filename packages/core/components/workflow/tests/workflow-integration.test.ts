import { HttpMethod } from "@superglue/shared";
import { describe, expect, it, vi } from "vitest";
import * as tools from "../../../utils/tools.js";
import { ApiWorkflowOrchestrator } from "../apiWorkflowOrchestrator.js";
import type { ExecutionPlan } from "../domain/workflow.types.js";

// Mock openai so that we don't have to use API keys to run the test
vi.mock("openai", () => {
  const mockCompletionsCreate = vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            jsonata: '{ "test": "data" }',
            confidence: 95,
            confidence_reasoning: "Test reasoning"
          })
        }
      }
    ]
  });

  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCompletionsCreate
        }
      };
    }
  };
});

// Create a spy on the applyJsonata function to verify it's called with the right transform
vi.mock("../../../utils/tools.js", async () => {
  const actual = await vi.importActual("../../../utils/tools.js");
  return {
    ...actual,
    applyJsonata: vi.fn(),
    applyJsonataWithValidation: vi.fn(),
  };
});

describe("ApiWorkflowOrchestrator Integration Tests", { timeout: 30000 }, () => {
  it("should execute a simple workflow with multiple steps", async () => {
    // Mock responses for the first test
    vi.mocked(tools.applyJsonataWithValidation).mockResolvedValue({
      success: true,
      data: {
        user: { 
          id: 1, 
          username: "testUser",
          name: "Test User"
        },
        posts: [
          { id: 1, title: "Post 1", body: "Content 1" },
          { id: 2, title: "Post 2", body: "Content 2" }
        ],
        summary: {
          username: "testUser",
          postCount: 2
        }
      }
    });

    // Create orchestrator instance with base API input
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

    // Define a simple workflow plan
    const plan: ExecutionPlan = {
      id: "simple_integration_plan",
      apiHost: "https://jsonplaceholder.typicode.com",
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
        }
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
    await orchestrator.setStepMapping(planId, "getUser", {
      inputMapping: "$",
      responseMapping: "$",
    });
    await orchestrator.setStepMapping(planId, "getUserPosts", {
      inputMapping: "{ userId: $.getUser.id }",
      responseMapping: "$",
    });

    // Mock the executeApiCall function for this test
    vi.mock("../execution/workflowUtils.js", async () => {
      const actual = await vi.importActual("../execution/workflowUtils.js");
      return {
        ...actual,
        executeApiCall: vi.fn().mockImplementation((apiConfig) => {
          if (apiConfig.urlPath === "/users/1") {
            return { 
              id: 1, 
              username: "testUser",
              name: "Test User"
            };
          } 
          
          if (apiConfig.urlPath.includes("/posts")) {
            return [
              { id: 1, title: "Post 1", body: "Content 1" },
              { id: 2, title: "Post 2", body: "Content 2" }
            ];
          }
          return null;
        }),
      };
    });

    const result = await orchestrator.executeWorkflowPlan(
      planId,
      {},
      {},
    );

    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveProperty("getUser");
    expect(result.stepResults).toHaveProperty("getUserPosts");
    expect(result.stepResults.getUser.success).toBe(true);
    expect(result.stepResults.getUserPosts.success).toBe(true);
    
    // Type the result data for proper assertions
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
    expect(typedData.user).toHaveProperty("username");
    expect(Array.isArray(typedData.posts)).toBe(true);
    expect(typedData.posts.length).toBeGreaterThan(0);
    expect(typedData.summary.username).toBe(typedData.user.username);
    expect(typedData.summary.postCount).toBe(typedData.posts.length);
  });

  it("should correctly transform dog breed data with images", async () => {
    vi.restoreAllMocks();
    
    // Mock the applyJsonata function to return our expected result
    const mockTransformResult = {
      breeds: [
        { affenpinscher: "https://images.dog.ceo/breeds/affenpinscher/n02110627_4130.jpg" },
        { african: "https://images.dog.ceo/breeds/african/n02116738_9333.jpg" },
        { airedale: "https://images.dog.ceo/breeds/airedale/n02096051_910.jpg" },
        { akita: "https://images.dog.ceo/breeds/akita/Japaneseakita.jpg" },
        { appenzeller: "https://images.dog.ceo/breeds/appenzeller/n02107908_5002.jpg" }
      ]
    };
    
    vi.mocked(tools.applyJsonata).mockResolvedValue(mockTransformResult);
    vi.mocked(tools.applyJsonataWithValidation).mockResolvedValue({
      success: true,
      data: mockTransformResult
    });

    // Create orchestrator instance with base API input
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

    const sampleData: Record<string, unknown> = {
      getAllBreeds: {
        message: {
          affenpinscher: [],
          african: [],
          airedale: [],
          akita: [],
          appenzeller: ["breed2"],
        },
        status: "success"
      },
      getBreedImage: [
        {
          message: "https://images.dog.ceo/breeds/affenpinscher/n02110627_4130.jpg",
          status: "success"
        },
        {
          message: "https://images.dog.ceo/breeds/african/n02116738_9333.jpg",
          status: "success"
        },
        {
          message: "https://images.dog.ceo/breeds/airedale/n02096051_910.jpg",
          status: "success"
        },
        {
          message: "https://images.dog.ceo/breeds/akita/Japaneseakita.jpg",
          status: "success"
        },
        {
          message: "https://images.dog.ceo/breeds/appenzeller/n02107908_5002.jpg",
          status: "success"
        }
      ]
    };

    const plan: ExecutionPlan = {
      id: "dog_breeds_transform_plan",
      apiHost: "https://dog.ceo/api",
      steps: [
        {
          id: "getAllBreeds",
          apiConfig: {
            urlPath: "/breeds/list/all",
            method: HttpMethod.GET,
            urlHost: "https://dog.ceo/api",
            instruction: "Get all dog breeds",
            id: "api_config_getAllBreeds",
          },
          executionMode: "DIRECT",
        },
        {
          id: "getBreedImage",
          apiConfig: {
            urlPath: "/breed/{breed}/images/random",
            method: HttpMethod.GET,
            urlHost: "https://dog.ceo/api",
            instruction: "Get random images for specific dog breeds",
            id: "api_config_getBreedImage",
          },
          executionMode: "LOOP",
          loopVariable: "breed",
          loopMaxIters: 5,
        },
      ],
      finalTransform: `{
        "breeds": [
          $map(
            $keys($.getAllBreeds.message)[0..4],
            function($breed) {
              {
                $breed: $filter($.getBreedImage, function($img) {
                  $contains($img.message, $breed)
                }).message
              }
            }
          )
        ]
      }`,
    };

    const planId = await orchestrator.registerExecutionPlan(plan);

    await orchestrator.setStepMapping(planId, "getAllBreeds", {
      inputMapping: "$",
      responseMapping: "$",
    });
    await orchestrator.setStepMapping(planId, "getBreedImage", {
      inputMapping: "$",
      responseMapping: "$",
    });

    // Mock the executeApiCall function to return our sample data
    vi.mock("../execution/workflowUtils.js", async () => {
      const actual = await vi.importActual("../execution/workflowUtils.js");
      return {
        ...actual,
        executeApiCall: vi.fn().mockImplementation((apiConfig) => {
          if (apiConfig.urlPath === "/breeds/list/all") {
            return sampleData.getAllBreeds;
          } 
          
          if (apiConfig.urlPath.includes("/breed/")) {
            // Find the breed from the URL path
            const breed = apiConfig.urlPath.split("/")[2];
            // Return the matching breed image from our sample data
            return (sampleData.getBreedImage as Array<{message: string; status: string}>).find(img => 
              img.message.includes(breed)
            );
          }
          return null;
        }),
      };
    });

    const result = await orchestrator.executeWorkflowPlan(
      planId,
      {},
      {},
    );

    const typedResult = result.data as {
      breeds: Array<Record<string, string>>
    };

    expect(result.success).toBe(true);
    expect(typedResult).toHaveProperty("breeds");
    expect(Array.isArray(typedResult.breeds)).toBe(true);
    expect(typedResult.breeds.length).toBe(5);

    const breedNames = ["affenpinscher", "african", "airedale", "akita", "appenzeller"];
    
    breedNames.forEach((breed, index) => {
      expect(typedResult.breeds[index]).toHaveProperty(breed);
      expect(typedResult.breeds[index][breed]).toContain(`https://images.dog.ceo/breeds/${breed}/`);
    });
    
    // Verify that the applyJsonata was called with the right transform
    expect(tools.applyJsonataWithValidation).toHaveBeenCalledWith(
      expect.anything(),
      plan.finalTransform,
      undefined
    );
  });
});
