import { HttpMethod } from "@superglue/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiWorkflowOrchestrator } from "./apiWorkflowOrchestrator.js";
import type { ExecutionPlan } from "./domain/workflow.types.js";

// Mock the tools module
vi.mock("../../utils/tools.js", () => ({
  applyJsonataWithValidation: vi.fn().mockImplementation((input, expression) => {
    // Special handling for our finalTransform in the joined data test
    if (expression === '{ "posts": postsByUser, "user": userData }') {
      return {
        success: true,
        data: {
          posts: [
            { id: 1, userId: 1, title: "Post 1", body: "Post body 1" },
            { id: 2, userId: 1, title: "Post 2", body: "Post body 2" },
          ],
          user: { id: 1, name: "Leanne Graham", username: "Bret", email: "Sincere@april.biz" },
        },
      };
    }

    // For user's posts transformation
    if (expression === "$") {
      if (input && typeof input === "object" && "userId" in input) {
        return {
          success: true,
          data: [
            { id: 1, userId: 1, title: "Post 1", body: "Post body 1" },
            { id: 2, userId: 1, title: "Post 2", body: "Post body 2" },
          ],
        };
      }
    }

    // Default behavior for other cases
    return {
      success: true,
      data: {
        getUserData: { id: 1, name: "Test User" },
        getData: { id: 2, name: "Test Data" },
        userData: { id: 1, name: "Leanne Graham", username: "Bret", email: "Sincere@april.biz" },
        postsByUser: [
          { id: 1, userId: 1, title: "Post 1", body: "Post body 1" },
          { id: 2, userId: 1, title: "Post 2", body: "Post body 2" },
        ],
      },
    };
  }),
}));

// Mock the api module
vi.mock("../../utils/api.js", () => {
  const mockCallEndpoint = vi.fn().mockImplementation((apiConfig) => {
    let responseData: any;

    // Return different mock data based on the endpoint
    if (apiConfig.urlPath === "/users/1") {
      responseData = {
        id: 1,
        name: "Leanne Graham",
        username: "Bret",
        email: "Sincere@april.biz",
      };
    } else if (apiConfig.urlPath === "/posts") {
      responseData = [
        { id: 1, userId: 1, title: "Post 1", body: "Post body 1" },
        { id: 2, userId: 1, title: "Post 2", body: "Post body 2" },
      ];
    } else {
      responseData = { result: "mocked data" };
    }

    return Promise.resolve({ data: responseData });
  });

  return {
    callEndpoint: mockCallEndpoint,
    generateApiConfig: vi.fn().mockImplementation((apiInput) => {
      return Promise.resolve({
        config: {
          id: "mock_config_id",
          urlHost: apiInput.urlHost,
          urlPath: apiInput.urlPath,
          method: apiInput.method,
          instruction: apiInput.instruction,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        messages: [],
      });
    }),
  };
});

// Mock documentation module
vi.mock("../../utils/documentation.js", () => ({
  getDocumentation: vi.fn().mockImplementation(() => {
    return Promise.resolve("Mock API documentation");
  }),
}));

// Mock schema module
vi.mock("../../utils/schema.js", () => ({
  generateSchema: vi.fn().mockImplementation(() => {
    return Promise.resolve("{}");
  }),
}));

describe("ApiWorkflowOrchestrator", () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute a manually defined workflow plan", async () => {
    // Create a minimal workflow orchestrator with base API input
    const baseApiInput = {
      urlHost: "https://jsonplaceholder.typicode.com",
      method: HttpMethod.GET,
      instruction: "Base configuration for JSONPlaceholder API",
      headers: {
        "Content-Type": "application/json",
      },
    };
    const orchestrator = new ApiWorkflowOrchestrator(baseApiInput);

    // Set up API documentation
    await orchestrator.retrieveApiDocumentation(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      "https://jsonplaceholder.typicode.com",
    );

    // Define a simple execution plan
    const plan: ExecutionPlan = {
      id: "test_plan",
      apiHost: "https://jsonplaceholder.typicode.com",
      steps: [
        {
          id: "getUserData",
          description: "Get user data",
          endpoint: "/users/1",
          method: HttpMethod.GET,
          executionMode: "DIRECT",
        },
      ],
      finalTransform: "$",
    };

    // Register the plan
    const planId = await orchestrator.registerExecutionPlan(plan);
    expect(planId).toBe("test_plan");

    // Define input/output mappings for steps
    await orchestrator.setStepMapping(planId, "getUserData", {
      inputMapping: "$",
      responseMapping: "$",
    });

    // Execute the workflow plan
    const result = await orchestrator.executeWorkflowPlan(planId, { query: "test" }, { apiKey: "fake-key" });

    // Check the result
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("getUserData");
    expect(result.stepResults).toHaveProperty("getUserData");
    expect(result.stepResults.getUserData.success).toBe(true);
  });

  it("should handle a workflow with a complete input object", async () => {
    const orchestrator = new ApiWorkflowOrchestrator({
      urlHost: "https://jsonplaceholder.typicode.com",
      method: HttpMethod.GET,
      instruction: "Base configuration for JSONPlaceholder API",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Set up API documentation first
    await orchestrator.retrieveApiDocumentation(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      "https://jsonplaceholder.typicode.com",
    );

    // Create a plan to include directly in the input
    const plan: ExecutionPlan = {
      id: "inline_plan",
      apiHost: "https://jsonplaceholder.typicode.com",
      steps: [
        {
          id: "getData",
          description: "Get data",
          endpoint: "/users/1",
          method: HttpMethod.GET,
          executionMode: "DIRECT",
        },
      ],
      finalTransform: "$",
    };

    // Use the executeWorkflow method with a complete input object
    const result = await orchestrator.executeWorkflow({
      plan,
      payload: { test: true },
      credentials: { apiKey: "test-key" },
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.stepResults).toHaveProperty("getData");
  });

  it("should join data from multiple JSONPlaceholder endpoints", async () => {
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

    // Set up API documentation
    await orchestrator.retrieveApiDocumentation(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      "https://jsonplaceholder.typicode.com",
    );

    // Define a plan that fetches user data and posts by that user
    const plan: ExecutionPlan = {
      id: "user_posts_plan",
      apiHost: "https://jsonplaceholder.typicode.com",
      steps: [
        {
          id: "userData",
          description: "Get user information",
          endpoint: "/users/1",
          method: HttpMethod.GET,
          executionMode: "DIRECT",
        },
        {
          id: "postsByUser",
          description: "Get posts by this user",
          endpoint: "/posts",
          method: HttpMethod.GET,
          dependencies: ["userData"], // This step depends on userData
          executionMode: "DIRECT",
        },
      ],
      // Join the data from both endpoints in the final result
      finalTransform: '{ "posts": postsByUser, "user": userData }',
    };

    // Register the plan and get its ID
    const planId = await orchestrator.registerExecutionPlan(plan);

    // Set up mapping for the user data step (simple pass-through)
    await orchestrator.setStepMapping(planId, "userData", {
      inputMapping: "$",
      responseMapping: "$",
    });

    // Set up mapping for the posts step (filter posts by user ID)
    await orchestrator.setStepMapping(planId, "postsByUser", {
      // Use the user ID from the userData step
      inputMapping: "{ userId: payload.userId || previousSteps.userData.id }",
      // Return only posts matching the user ID
      responseMapping: "$",
    });

    // Execute the workflow
    const result = await orchestrator.executeWorkflowPlan(
      planId,
      { userId: 1 }, // Input payload with user ID
      { apiKey: "test-key" },
    );

    // Verify the result
    expect(result.success).toBe(true);

    // Check that both steps executed successfully
    expect(result.stepResults).toHaveProperty("userData");
    expect(result.stepResults).toHaveProperty("postsByUser");
    expect(result.stepResults.userData.success).toBe(true);
    expect(result.stepResults.postsByUser.success).toBe(true);

    // Check the joined data structure
    expect(result.data).toHaveProperty("user");
    expect(result.data).toHaveProperty("posts");

    // Verify user data
    const userData = result.data.user as Record<string, any>;
    expect(userData).toHaveProperty("id", 1);
    expect(userData).toHaveProperty("name", "Leanne Graham");
    expect(userData).toHaveProperty("email", "Sincere@april.biz");

    // Verify posts data
    const posts = result.data.posts as Array<Record<string, any>>;
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]).toHaveProperty("userId", 1);
    expect(posts[0]).toHaveProperty("title");
    expect(posts[0]).toHaveProperty("body");
  });

  it("should execute a workflow with LOOP execution mode", async () => {
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

    // Set up API documentation
    await orchestrator.retrieveApiDocumentation(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      "https://jsonplaceholder.typicode.com",
    );

    // Define a plan with a LOOP step
    const plan: ExecutionPlan = {
      id: "loop_mode_plan",
      apiHost: "https://jsonplaceholder.typicode.com",
      steps: [
        {
          id: "getUsers",
          description: "Get list of users",
          endpoint: "/users",
          method: HttpMethod.GET,
          executionMode: "DIRECT",
        },
        {
          id: "getUserPosts",
          description: "Get posts for each user",
          endpoint: "/posts?userId=${userId}",
          method: HttpMethod.GET,
          dependencies: ["getUsers"],
          executionMode: "LOOP", // Using LOOP mode explicitly
        },
      ],
      finalTransform: "$",
    };

    // Register the plan
    const planId = await orchestrator.registerExecutionPlan(plan);

    // Set up mappings
    await orchestrator.setStepMapping(planId, "getUsers", {
      inputMapping: "$",
      responseMapping: "$",
    });

    await orchestrator.setStepMapping(planId, "getUserPosts", {
      inputMapping: "{ userId: getUsers[0].id }", // Get the ID of the first user
      responseMapping: "$",
    });

    // Execute the workflow
    const result = await orchestrator.executeWorkflowPlan(
      planId,
      {}, // No specific input needed
      { apiKey: "test-key" },
    );

    // Verify the result
    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveProperty("getUsers");
    expect(result.stepResults).toHaveProperty("getUserPosts");
    expect(result.stepResults.getUsers.success).toBe(true);
    expect(result.stepResults.getUserPosts.success).toBe(true);
  });
});
