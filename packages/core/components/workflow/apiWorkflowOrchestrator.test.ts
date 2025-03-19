import { HttpMethod } from "@superglue/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiWorkflowOrchestrator } from "./apiWorkflowOrchestrator.js";
import type { ExecutionPlan } from "./domain/workflow.types.js";

// Mock the tools module
vi.mock("../../utils/tools.js", () => ({
  applyJsonata: vi.fn().mockImplementation((input, expression) => {
    // Special handling for our finalTransform in the joined data test
    if (expression === '{ "posts": postsByUser, "user": userData }') {
      return Promise.resolve({
        posts: [
          { id: 1, userId: 1, title: "Post 1", body: "Post body 1" },
          { id: 2, userId: 1, title: "Post 2", body: "Post body 2" },
        ],
        user: { id: 1, name: "Leanne Graham", username: "Bret", email: "Sincere@april.biz" },
      });
    }

    // For user's posts transformation
    if (expression === "$") {
      if (input && typeof input === "object" && "userId" in input) {
        return Promise.resolve([
          { id: 1, userId: 1, title: "Post 1", body: "Post body 1" },
          { id: 2, userId: 1, title: "Post 2", body: "Post body 2" },
        ]);
      }
    }

    // Add special handling for LOOP test case
    if (expression === "{ userId: $.getUsers.*.id }") {
      return Promise.resolve({
        userId: [1, 2, 3], // Array of user IDs for the loop execution
      });
    }

    // Default behavior for other cases
    return Promise.resolve({
      getUserData: { id: 1, name: "Test User" },
      getData: { id: 2, name: "Test Data" },
      userData: { id: 1, name: "Leanne Graham", username: "Bret", email: "Sincere@april.biz" },
      postsByUser: [
        { id: 1, userId: 1, title: "Post 1", body: "Post body 1" },
        { id: 2, userId: 1, title: "Post 2", body: "Post body 2" },
      ],
      getUsers: [
        { id: 1, name: "User 1" },
        { id: 2, name: "User 2" },
        { id: 3, name: "User 3" },
      ],
    });
  }),
}));

vi.mock("../../utils/api.js", () => {
  const mockCallEndpoint = vi.fn().mockImplementation((apiConfig, payload) => {
    let responseData: any;

    let urlPath = apiConfig.urlPath;
    if (urlPath && payload) {
      for (const key of Object.keys(payload)) {
        urlPath = urlPath.replace(new RegExp(`\\{${key}\\}`, "g"), payload[key]);
      }
    }

    // Return different mock data based on the endpoint
    if (urlPath === "/users/1") {
      responseData = {
        id: 1,
        name: "Leanne Graham",
        username: "Bret",
        email: "Sincere@april.biz",
      };
    } else if (urlPath === "/posts") {
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

vi.mock("../../utils/documentation.js", () => ({
  getDocumentation: vi.fn().mockImplementation(() => {
    return Promise.resolve("Mock API documentation");
  }),
}));

vi.mock("../../utils/schema.js", () => ({
  generateSchema: vi.fn().mockImplementation(() => {
    return Promise.resolve("{}");
  }),
}));

describe("ApiWorkflowOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute a manually defined workflow plan", async () => {
    const baseApiInput = {
      urlHost: "https://jsonplaceholder.typicode.com",
      method: HttpMethod.GET,
      instruction: "Base configuration for JSONPlaceholder API",
      headers: {
        "Content-Type": "application/json",
      },
    };
    const orchestrator = new ApiWorkflowOrchestrator(baseApiInput);

    await orchestrator.retrieveApiDocumentation("https://jsonplaceholder.typicode.com", {}, {});

    const plan: ExecutionPlan = {
      id: "test_plan",
      steps: [
        {
          id: "getUserData",
          apiConfig: {
            urlPath: "/users/1",
            method: HttpMethod.GET,
            urlHost: "https://jsonplaceholder.typicode.com",
            instruction: "Get user data",
            id: "api_config_getUserData",
          },
          executionMode: "DIRECT",
          inputMapping: "$",
          responseMapping: "$",
        },
      ],
      finalTransform: "$",
    };

    const planId = await orchestrator.registerExecutionPlan(plan);
    expect(planId).toBe("test_plan");

    const result = await orchestrator.executeWorkflowPlan(planId, { query: "test" }, { apiKey: "fake-key" });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("getUserData");
    expect(result.stepResults).toHaveProperty("getUserData");
    expect(result.stepResults.getUserData.success).toBe(true);
  });

  it("should handle a workflow with a plan directly", async () => {
    const orchestrator = new ApiWorkflowOrchestrator({
      urlHost: "https://jsonplaceholder.typicode.com",
      method: HttpMethod.GET,
      instruction: "Base configuration for JSONPlaceholder API",
      headers: {
        "Content-Type": "application/json",
      },
    });

    await orchestrator.retrieveApiDocumentation("https://jsonplaceholder.typicode.com", {}, {});

    const plan: ExecutionPlan = {
      id: "inline_plan",
      steps: [
        {
          id: "getData",
          apiConfig: {
            urlPath: "/users/1",
            method: HttpMethod.GET,
            urlHost: "https://jsonplaceholder.typicode.com",
            instruction: "Get data",
            id: "api_config_getData",
          },
          executionMode: "DIRECT",
          inputMapping: "$",
          responseMapping: "$",
        },
      ],
      finalTransform: "$",
    };

    const planId = await orchestrator.registerExecutionPlan(plan);

    const result = await orchestrator.executeWorkflowPlan(planId, { test: true }, { apiKey: "test-key" });

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

    await orchestrator.retrieveApiDocumentation("https://jsonplaceholder.typicode.com", {}, {});

    const plan: ExecutionPlan = {
      id: "user_posts_plan",
      steps: [
        {
          id: "userData",
          apiConfig: {
            urlPath: "/users/1",
            method: HttpMethod.GET,
            urlHost: "https://jsonplaceholder.typicode.com",
            instruction: "Get user information",
            id: "api_config_userData",
          },
          executionMode: "DIRECT",
          inputMapping: "$",
          responseMapping: "$",
        },
        {
          id: "postsByUser",
          apiConfig: {
            urlPath: "/posts",
            method: HttpMethod.GET,
            urlHost: "https://jsonplaceholder.typicode.com",
            instruction: "Get posts by this user",
            id: "api_config_postsByUser",
          },
          executionMode: "DIRECT",
          // Use the user ID from the userData step
          inputMapping: "{ userId: payload.userId || previousSteps.userData.id }",
          // Return only posts matching the user ID
          responseMapping: "$",
        },
      ],
      // Join the data from both endpoints in the final result
      finalTransform: '{ "posts": postsByUser, "user": userData }',
    };

    const planId = await orchestrator.registerExecutionPlan(plan);

    const result = await orchestrator.executeWorkflowPlan(
      planId,
      { userId: 1 }, // Input payload with user ID
      { apiKey: "test-key" },
    );

    expect(result.success).toBe(true);

    expect(result.stepResults).toHaveProperty("userData");
    expect(result.stepResults).toHaveProperty("postsByUser");
    expect(result.stepResults.userData.success).toBe(true);
    expect(result.stepResults.postsByUser.success).toBe(true);

    expect(result.data).toHaveProperty("user");
    expect(result.data).toHaveProperty("posts");

    const userData = result.data.user as Record<string, any>;
    expect(userData).toHaveProperty("id", 1);
    expect(userData).toHaveProperty("name", "Leanne Graham");
    expect(userData).toHaveProperty("email", "Sincere@april.biz");

    const posts = result.data.posts as Array<Record<string, any>>;
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]).toHaveProperty("userId", 1);
    expect(posts[0]).toHaveProperty("title");
    expect(posts[0]).toHaveProperty("body");
  });

  it("should execute a workflow with LOOP execution mode", async () => {
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

    await orchestrator.retrieveApiDocumentation("https://jsonplaceholder.typicode.com", {}, {});

    const plan: ExecutionPlan = {
      id: "loop_mode_plan",
      steps: [
        {
          id: "getUsers",
          apiConfig: {
            urlPath: "/users",
            method: HttpMethod.GET,
            urlHost: "https://jsonplaceholder.typicode.com",
            instruction: "Get list of users",
            id: "api_config_getUsers",
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
            instruction: "Get posts for each user",
            id: "api_config_getUserPosts",
          },
          executionMode: "LOOP",
          loopVariable: "userId",
          inputMapping: "{ userId: $.getUsers.*.id }",
          responseMapping: "$",
        },
      ],
      finalTransform: "$",
    };

    const planId = await orchestrator.registerExecutionPlan(plan);

    const result = await orchestrator.executeWorkflowPlan(planId, {}, { apiKey: "test-key" });

    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveProperty("getUsers");
    expect(result.stepResults).toHaveProperty("getUserPosts");
    expect(result.stepResults.getUsers.success).toBe(true);
    expect(result.stepResults.getUserPosts.success).toBe(true);
  });
});
