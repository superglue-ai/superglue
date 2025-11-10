import playwright from "@playwright/test";
import { Metadata } from "@superglue/shared";
import axios from "axios";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  Mocked,
  vi,
} from "vitest";
import { server_defaults } from "../default.js";
import { DocumentationFetcher } from "./documentation-fetching.js";
import { PlaywrightFetchingStrategy } from "./strategies/index.js";
import { DocumentationSearch } from "./documentation-search.js";

// Mock playwright and axios
vi.mock("@playwright/test", async (importOriginal) => {
  const original = (await importOriginal()) as any;
  return {
    ...original, // Preserve other exports if any
    default: {
      chromium: {
        launch: vi.fn(),
      },
    },
  };
});

vi.mock("axios");

// Helper to create standard Playwright mocks
const createPlaywrightMocks = () => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue(""),
    evaluate: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };

  // Setup the browser launch mock with a type assertion
  vi.mocked(playwright.chromium.launch).mockResolvedValue(
    mockBrowser as unknown as playwright.Browser,
  );

  return { mockPage, mockContext, mockBrowser };
};

describe("Documentation Class", () => {
  let mockPage: any;
  let mockContext: any;
  let mockBrowser: any;
  let mockedAxios: Mocked<typeof axios>; // Use Mocked type
  let metadata: Metadata = { orgId: "" };
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockedAxios = axios as Mocked<typeof axios>; // Ensure axios is typed correctly
    mockedAxios.get.mockReset(); // Reset mocks specifically
    mockedAxios.post.mockReset();

    // Set LLM_PROVIDER env var to prevent errors when accessing LanguageModel.contextLength
    process.env.LLM_PROVIDER = "ANTHROPIC";

    // Create standard mocks for Playwright
    ({ mockPage, mockContext, mockBrowser } = createPlaywrightMocks());
  });

  afterEach(async () => {
    // Use the static closeBrowser from the strategy class
    await PlaywrightFetchingStrategy.closeBrowser();
  });

  describe("fetchAndProcess", () => {
    it("should fetch and convert HTML documentation via Playwright", async () => {
      const htmlDoc = `
        <html><body><h1>API Docs</h1><p>Details here.</p></body></html>
      `;
      mockPage.evaluate.mockResolvedValue({
        html: htmlDoc,
        textContent: "API Docs Details here.",
        links: {},
      });

      // Mock sitemap requests to fail (404)
      mockedAxios.get.mockRejectedValue(new Error("404"));

      const docUrl = "https://api.example.com/docs";
      const doc = new DocumentationFetcher(
        { documentationUrl: docUrl, urlHost: "https://api.example.com" },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
      expect(mockContext.newPage).toHaveBeenCalledTimes(1);
      expect(mockPage.goto).toHaveBeenCalledWith(docUrl, {
        timeout: server_defaults.DOCUMENTATION.TIMEOUTS.PLAYWRIGHT,
      });
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith(
        "domcontentloaded",
        { timeout: server_defaults.DOCUMENTATION.TIMEOUTS.PLAYWRIGHT },
      );
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1); // Single evaluate for DOM manipulation and link extraction
      expect(result).toContain("# API Docs");
      expect(result).toContain("Details here.");
      // Sitemap fetches are attempted
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("should return raw page content if not HTML, GraphQL, or OpenAPI", async () => {
      const plainDoc = "Plain text documentation content.";
      mockPage.evaluate.mockResolvedValue({
        html: plainDoc,
        textContent: plainDoc,
        links: {},
      });

      // Mock sitemap requests to fail
      mockedAxios.get.mockRejectedValue(new Error("404"));

      const doc = new DocumentationFetcher(
        {
          documentationUrl: "https://api.example.com/raw",
          urlHost: "https://api.example.com",
        },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
      expect(result).toBe(plainDoc);
      expect(mockedAxios.get).toHaveBeenCalled(); // Sitemap attempts
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("should attempt GraphQL introspection for likely GraphQL URLs", async () => {
      const mockSchema = { __schema: { types: [{ name: "Query" }] } };
      mockedAxios.post.mockResolvedValueOnce({ data: { data: mockSchema } });
      const docUrl = "https://api.example.com/graphql";
      const headers = { Auth: "key" };
      const params = { p: "1" };
      const doc = new DocumentationFetcher(
        {
          documentationUrl: docUrl,
          urlHost: "https://api.example.com",
          urlPath: "/graphql",
          headers,
          queryParams: params,
        },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        docUrl,
        expect.objectContaining({ operationName: "IntrospectionQuery" }),
        {
          headers,
          params,
          timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS,
        },
      );
      expect(result).toBe(JSON.stringify(mockSchema.__schema));
      expect(playwright.chromium.launch).not.toHaveBeenCalled();
    });

    it("should fall back to Playwright fetch if GraphQL introspection fails", async () => {
      const htmlDoc = `<html><body>GraphQL Maybe?</body></html>`;
      mockedAxios.post.mockRejectedValueOnce(
        new Error("GraphQL Network Error"),
      ); // Simulate network failure
      mockPage.evaluate.mockResolvedValue({
        html: htmlDoc,
        textContent: "GraphQL Maybe?",
        links: {},
      });

      const docUrl = "https://api.example.com/graphql"; // Looks like GraphQL
      const doc = new DocumentationFetcher(
        { documentationUrl: docUrl, urlHost: "https://api.example.com" },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      // Check GraphQL was attempted
      expect(mockedAxios.post).toHaveBeenCalledWith(
        docUrl,
        expect.anything(),
        expect.anything(),
      );
      // Check Playwright was used as fallback
      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
      // Check result is from Playwright fetch (processed HTML)
      expect(result).toContain("GraphQL Maybe?");
    });

    it("should fall back to Playwright fetch if GraphQL returns errors", async () => {
      const htmlDoc = `<html><body>GraphQL Maybe?</body></html>`;
      mockedAxios.post.mockResolvedValueOnce({
        data: { errors: [{ message: "Bad Query" }] },
      }); // Simulate GQL error response
      mockPage.evaluate.mockResolvedValue({
        html: htmlDoc,
        textContent: "GraphQL Maybe?",
        links: {},
      });

      const docUrl = "https://api.example.com/graphql"; // Looks like GraphQL
      const doc = new DocumentationFetcher(
        { documentationUrl: docUrl, urlHost: "https://api.example.com" },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      // Check GraphQL was attempted
      expect(mockedAxios.post).toHaveBeenCalledWith(
        docUrl,
        expect.anything(),
        expect.anything(),
      );
      // Check Playwright was used as fallback
      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
      // Check result is from Playwright fetch (processed HTML)
      expect(result).toContain("GraphQL Maybe?");
    });

    it("should extract and fetch relative OpenAPI URL found in HTML", async () => {
      const openApiJson = { openapi: "3.0.1", info: { title: "My API" } };
      const baseUrl = "https://base.example.com/docs";

      // Mock Axios to return OpenAPI spec directly (simulating Axios strategy success)
      mockedAxios.get.mockResolvedValue({ data: openApiJson });

      const doc = new DocumentationFetcher(
        { documentationUrl: baseUrl, urlHost: "https://api.example.com" },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      // Verify result contains the OpenAPI spec (formatted with indentation)
      expect(result).toContain('"openapi": "3.0.1"');
      expect(result).toContain('"title": "My API"');
    });

    it("should handle page content being the OpenAPI spec directly (JSON)", async () => {
      const openApiJsonString = JSON.stringify({
        swagger: "2.0",
        info: { title: "Direct JSON" },
      });
      mockPage.evaluate.mockResolvedValue({
        html: openApiJsonString,
        textContent: openApiJsonString,
        links: {},
      });

      // Mock sitemap requests to fail
      mockedAxios.get.mockRejectedValue(new Error("404"));

      const docUrl = "https://api.example.com/openapi.json";
      const doc = new DocumentationFetcher(
        { documentationUrl: docUrl, urlHost: "https://api.example.com" },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
      expect(result).toContain(openApiJsonString);
    });

    it("should handle page content being the OpenAPI spec directly (YAML)", async () => {
      const openApiYaml = `openapi: 3.1.0\ninfo:\n  title: Direct YAML`;
      mockPage.evaluate.mockResolvedValue({
        html: openApiYaml,
        textContent: openApiYaml,
        links: {},
      });

      // Mock sitemap requests to fail
      mockedAxios.get.mockRejectedValue(new Error("404"));

      const docUrl = "https://api.example.com/openapi.yaml";
      const doc = new DocumentationFetcher(
        { documentationUrl: docUrl, urlHost: "https://api.example.com" },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
      expect(result).toBe(openApiYaml);
    });

    it("should fall back to HTML->Markdown if OpenAPI extraction/fetch fails", async () => {
      const swaggerHtml = `<html><script id="swagger-settings">{ "url": "/missing.json" }</script><body>Content</body></html>`;
      mockPage.evaluate.mockResolvedValue({
        html: swaggerHtml,
        textContent: "Content",
        links: {},
      });

      // All requests fail
      mockedAxios.get.mockRejectedValue(new Error("404 Not Found"));

      const headers = { Auth: "key" };
      const docUrl = "https://api.example.com/docs";
      const doc = new DocumentationFetcher(
        {
          documentationUrl: docUrl,
          urlHost: "https://api.example.com",
          headers,
        },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
      // Result should be the Markdown conversion of the original HTML
      expect(result).toContain("Content");
      expect(result).not.toContain("missing.json");
    });

    it("should handle Playwright fetch errors gracefully", async () => {
      vi.mocked(playwright.chromium.launch).mockRejectedValueOnce(
        new Error("Browser launch failed"),
      );
      const doc = new DocumentationFetcher(
        {
          documentationUrl: "https://api.example.com/docs",
          urlHost: "https://api.example.com",
        },
        {},
        metadata,
      );
      const result = await doc.fetchAndProcess();

      expect(result).toBe(""); // Should return empty string on complete failure
      expect(mockedAxios.get).toHaveBeenCalled(); // should call axios instead
    });

    it("should cache the result and return processed result on subsequent calls", async () => {
      // Test with a simple text response via Axios
      const plainDoc = "Plain text data";

      // Mock Axios to return plain text (first strategy to succeed)
      mockedAxios.get.mockResolvedValue({ data: plainDoc });

      const httpDoc = new DocumentationFetcher(
        { documentationUrl: "http://example.com/docs.txt" },
        {},
        metadata,
      );

      const resHttp1 = await httpDoc.fetchAndProcess();
      expect(resHttp1).toBe(plainDoc);

      // Reset the call count for the second call to test caching
      const initialCallCount = mockedAxios.get.mock.calls.length;

      const resHttp2 = await httpDoc.fetchAndProcess();
      expect(resHttp2).toBe(plainDoc);
      expect(mockedAxios.get.mock.calls.length).toBe(initialCallCount); // No additional calls (cached)
    });
  });

  describe("extractRelevantSections", () => {
    const documentationSearch = new DocumentationSearch({ orgId: "test" });

    it("should return empty string for empty documentation", () => {
      const result = documentationSearch.extractRelevantSections(
        "",
        "some instruction",
      );
      expect(result).toBe("");
    });

    it("should return whole doc if no valid search terms but doc is small", () => {
      const doc = "Some documentation content here";
      const result = documentationSearch.extractRelevantSections(doc, "a b c"); // All terms too short
      expect(result).toBe(doc); // Returns whole doc since it's smaller than section size
    });

    it("should return whole doc if smaller than section size", () => {
      const doc = "Short documentation";
      const result = documentationSearch.extractRelevantSections(
        doc,
        "documentation",
        5,
        500,
      );
      expect(result).toBe(doc);
    });

    it("should return empty string if no sections match search terms", () => {
      const doc = "A".repeat(1000);
      const result = documentationSearch.extractRelevantSections(
        doc,
        "nonexistent term",
        5,
        200,
      );
      expect(result).toBe("");
    });

    it("should extract sections matching search terms", () => {
      const doc =
        "prefix ".repeat(50) +
        "important api endpoint here " +
        "suffix ".repeat(50);
      const result = documentationSearch.extractRelevantSections(
        doc,
        "api endpoint",
        3,
        200,
      );

      expect(result).toContain("api");
      expect(result).toContain("endpoint");
      expect(result.length).toBeLessThanOrEqual(3 * 200);
    });

    it("should respect maxSections parameter", () => {
      const section1 = "first section with keyword api " + "x".repeat(170);
      const section2 = "second section with keyword api " + "y".repeat(170);
      const section3 = "third section with keyword api " + "z".repeat(170);
      const doc = section1 + section2 + section3;

      const result = documentationSearch.extractRelevantSections(
        doc,
        "api",
        2,
        200,
      );

      const sections = result.split("\n\n");
      expect(sections.length).toBeLessThanOrEqual(2);
      expect(result.length).toBeLessThanOrEqual(2 * 200);
    });

    it("should respect sectionSize parameter", () => {
      const doc = "test api ".repeat(100); // ~900 chars
      const result = documentationSearch.extractRelevantSections(
        doc,
        "api test",
        3,
        250,
      );

      // Should create sections of 250 chars each
      expect(result.length).toBeLessThanOrEqual(3 * 250);
      expect(result).toContain("api");
      expect(result).toContain("test");
    });

    it("should handle multiple search terms and score accordingly", () => {
      const section1 =
        "authentication and authorization required " + "x".repeat(160);
      const section2 = "just some random content here " + "y".repeat(170);
      const section3 = "authentication mentioned once " + "z".repeat(170);
      const doc = section1 + section2 + section3;

      const result = documentationSearch.extractRelevantSections(
        doc,
        "authentication authorization",
        2,
        200,
      );

      // Section 1 should score highest (has both terms)
      // Section 3 should score second (has one term)
      // Section 2 should not be included (has no terms)
      expect(result).toContain("authentication");
      expect(result).toContain("authorization");
      expect(result).not.toContain("random content");
    });

    it("should maintain section order after scoring", () => {
      const section1 = "first match for keyword " + "a".repeat(176);
      const section2 = "no matches here at all " + "b".repeat(177);
      const section3 = "third match for keyword " + "c".repeat(176);
      const doc = section1 + section2 + section3;

      const result = documentationSearch.extractRelevantSections(
        doc,
        "keyword",
        2,
        200,
      );

      // Both matching sections should be included in their original order
      const firstIndex = result.indexOf("first");
      const thirdIndex = result.indexOf("third");
      expect(firstIndex).toBeLessThan(thirdIndex);
    });

    it("should validate and adjust input parameters", () => {
      const doc = "test content ".repeat(100);

      // Test with invalid maxSections (too high)
      const result1 = documentationSearch.extractRelevantSections(
        doc,
        "test",
        150,
        200,
      );
      expect(result1).toContain("test");

      // Test with invalid sectionSize (too small)
      const result2 = documentationSearch.extractRelevantSections(
        doc,
        "test",
        5,
        50,
      );
      expect(result2).toContain("test");

      // Test with 0 or negative values
      const result3 = documentationSearch.extractRelevantSections(
        doc,
        "test",
        0,
        -100,
      );
      expect(result3).toContain("test");
    });

    it("should filter search terms by minimum length", () => {
      const doc = "authentication system for api access";

      // "for" should be filtered out (too short)
      const result = documentationSearch.extractRelevantSections(
        doc,
        "for api",
        1,
        200,
      );
      expect(result).toContain("api");

      // Returns whole doc if all terms are too short and doc is small
      const result2 = documentationSearch.extractRelevantSections(
        doc,
        "a or by",
        1,
        200,
      );
      expect(result2).toBe(doc); // Whole doc since it's smaller than section size
    });

    describe("OpenAPI schema integration", () => {
      it("should extract security information when security keywords are present", () => {
        const openApiSpec = JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0.0" },
          components: {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
              },
              apiKey: {
                type: "apiKey",
                in: "header",
                name: "X-API-Key",
              },
            },
          },
          security: [{ bearerAuth: [] }],
          paths: {
            "/users": {
              get: {
                summary: "Get users",
                operationId: "getUsers",
                responses: { "200": { description: "Success" } },
              },
            },
          },
        });

        const doc = "General documentation content about the API usage.";
        const result = documentationSearch.extractRelevantSections(
          doc,
          "authentication bearer token",
          5,
          2000,
          openApiSpec,
        );

        expect(result).toContain("=== SECURITY ===");
        expect(result).toContain("bearerAuth");
        expect(result).toContain("bearer");
        expect(result).toContain("JWT");
        expect(result).toContain("apiKey");
        expect(result).toContain("X-API-Key");
      });

      it("should not extract security info when no security keywords in query", () => {
        const openApiSpec = JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0.0" },
          components: {
            securitySchemes: {
              bearerAuth: { type: "http", scheme: "bearer" },
            },
          },
          paths: {
            "/users": {
              get: {
                summary: "Get users",
                operationId: "getUsers",
                tags: ["users"],
                responses: { "200": { description: "Success" } },
              },
            },
          },
        });

        const doc = "General documentation content.";
        const result = documentationSearch.extractRelevantSections(
          doc,
          "users list",
          5,
          2000,
          openApiSpec,
        );

        expect(result).not.toContain("=== SECURITY ===");
        expect(result).not.toContain("bearerAuth");
      });

      it("should extract and rank relevant OpenAPI operations based on search terms", () => {
        const openApiSpec = JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0.0" },
          paths: {
            "/users": {
              get: {
                summary: "List all users",
                operationId: "listUsers",
                tags: ["users"],
                description: "Get a list of all users in the system",
                responses: { "200": { description: "Success" } },
              },
              post: {
                summary: "Create a user",
                operationId: "createUser",
                tags: ["users"],
                description: "Create a new user account",
                responses: { "201": { description: "Created" } },
              },
            },
            "/products": {
              get: {
                summary: "List products",
                operationId: "listProducts",
                tags: ["products"],
                description: "Get all products from catalog",
                responses: { "200": { description: "Success" } },
              },
            },
            "/users/{id}": {
              get: {
                summary: "Get user by ID",
                operationId: "getUserById",
                tags: ["users"],
                description: "Fetch a single user by their unique identifier",
                parameters: [
                  {
                    name: "id",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                  },
                ],
                responses: { "200": { description: "Success" } },
              },
            },
          },
        });

        const doc = "Some general documentation text.";
        const result = documentationSearch.extractRelevantSections(
          doc,
          "users account identifier",
          5,
          2000,
          openApiSpec,
        );

        expect(result).toContain("=== OPENAPI OPERATIONS ===");
        expect(result).toContain("[GET /users]");
        expect(result).toContain("listUsers");

        // Should not include products endpoint since search terms only match user-related operations
        expect(result).not.toContain("products");
        expect(result).not.toContain("listProducts");
      });

      it("should match operations by path, method, operationId, and description", () => {
        const openApiSpec = JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0.0" },
          paths: {
            "/auth/login": {
              post: {
                summary: "User login",
                operationId: "loginUser",
                tags: ["authentication"],
                description:
                  "Authenticate user with credentials and return token",
                responses: { "200": { description: "Success" } },
              },
            },
            "/auth/logout": {
              post: {
                summary: "User logout",
                operationId: "logoutUser",
                tags: ["authentication"],
                description: "Invalidate user session token",
                responses: { "200": { description: "Success" } },
              },
            },
            "/users/profile": {
              get: {
                summary: "Get profile",
                operationId: "getProfile",
                tags: ["users"],
                description: "Get current user profile",
                responses: { "200": { description: "Success" } },
              },
            },
          },
        });

        // Search by path component
        const result1 = documentationSearch.extractRelevantSections(
          "",
          "auth login",
          5,
          2000,
          openApiSpec,
        );
        expect(result1).toContain("[POST /auth/login]");
        expect(result1).toContain("loginUser");
        expect(result1).toContain("Authenticate user with credentials");

        // Search by operationId
        const result2 = documentationSearch.extractRelevantSections(
          "",
          "logoutUser",
          5,
          2000,
          openApiSpec,
        );
        expect(result2).toContain("[POST /auth/logout]");
        expect(result2).toContain("logoutUser");

        // Search by tag
        const result3 = documentationSearch.extractRelevantSections(
          "",
          "authentication",
          5,
          2000,
          openApiSpec,
        );
        expect(result3).toContain("authentication");
        expect(result3).toContain("login");
      });

      it("should limit number of returned operations based on maxSections", () => {
        const openApiSpec = JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0.0" },
          paths: {
            "/users": {
              get: {
                summary: "List users",
                operationId: "listUsers",
                description: "Get all users in the system",
                responses: { "200": { description: "Success" } },
              },
              post: {
                summary: "Create user",
                operationId: "createUser",
                description: "Create a new user account",
                responses: { "201": { description: "Created" } },
              },
            },
            "/users/{id}": {
              get: {
                summary: "Get user",
                operationId: "getUser",
                description: "Retrieve user by ID",
                responses: { "200": { description: "Success" } },
              },
              put: {
                summary: "Update user",
                operationId: "updateUser",
                description: "Update user information",
                responses: { "200": { description: "Success" } },
              },
              delete: {
                summary: "Delete user",
                operationId: "deleteUser",
                description: "Remove user from system",
                responses: { "204": { description: "Deleted" } },
              },
            },
          },
        });

        // With maxSections=2, should only get top 2 matching operations
        const result = documentationSearch.extractRelevantSections(
          "",
          "users",
          2,
          2000,
          openApiSpec,
        );

        expect(result).toContain("=== OPENAPI OPERATIONS ===");

        // Count operation delimiters to verify we got limited results
        const operationCount = (
          result.match(/\[(?:GET|POST|PUT|DELETE) /g) || []
        ).length;
        expect(operationCount).toBeLessThanOrEqual(2);
      });

      it("should handle OpenAPI spec with parameters in operations", () => {
        const openApiSpec = JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0.0" },
          paths: {
            "/search": {
              get: {
                summary: "Search items",
                operationId: "searchItems",
                description: "Search for items using query parameters",
                parameters: [
                  {
                    name: "query",
                    in: "query",
                    required: true,
                    schema: { type: "string" },
                  },
                  { name: "limit", in: "query", schema: { type: "integer" } },
                  { name: "offset", in: "query", schema: { type: "integer" } },
                ],
                responses: { "200": { description: "Success" } },
              },
            },
          },
        });

        // Search should match parameter names
        const result = documentationSearch.extractRelevantSections(
          "",
          "query limit search",
          5,
          2000,
          openApiSpec,
        );

        expect(result).toContain("[GET /search]");
        expect(result).toContain("searchItems");
        expect(result).toContain("query");
        expect(result).toContain("limit");
      });

      it("should combine documentation sections with OpenAPI operations", () => {
        const openApiSpec = JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0.0" },
          paths: {
            "/users": {
              get: {
                summary: "Get users",
                operationId: "getUsers",
                description: "List all users",
                responses: { "200": { description: "Success" } },
              },
            },
          },
        });

        const doc =
          "This documentation explains how to use the users endpoint. " +
          "The users API allows you to manage user accounts. " +
          "You can list, create, update, and delete users.";

        const result = documentationSearch.extractRelevantSections(
          doc,
          "users",
          5,
          2000,
          openApiSpec,
        );

        // Should contain both documentation sections and OpenAPI operations
        // Note: === DOCUMENTATION === header is only added when security info is present
        expect(result).toContain("users endpoint");
        expect(result).toContain("manage user accounts");
        expect(result).toContain("=== OPENAPI OPERATIONS ===");
        expect(result).toContain("[GET /users]");
        expect(result).toContain("getUsers");
      });

      it("should add DOCUMENTATION header when security info is also present", () => {
        const openApiSpec = JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0.0" },
          components: {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
              },
            },
          },
          security: [{ bearerAuth: [] }],
          paths: {
            "/users": {
              get: {
                summary: "Get users",
                operationId: "getUsers",
                description: "List all users",
                responses: { "200": { description: "Success" } },
              },
            },
          },
        });

        const doc =
          "This documentation explains the API. Users endpoint allows managing accounts.";

        const result = documentationSearch.extractRelevantSections(
          doc,
          "users authentication",
          5,
          2000,
          openApiSpec,
        );

        // With security keywords, should have all three sections with headers
        expect(result).toContain("=== SECURITY ===");
        expect(result).toContain("bearerAuth");
        expect(result).toContain("=== DOCUMENTATION ===");
        expect(result).toContain("Users endpoint");
        expect(result).toContain("=== OPENAPI OPERATIONS ===");
        expect(result).toContain("[GET /users]");
      });

      it("should handle Google Discovery schema format", () => {
        const googleDiscoverySpec = JSON.stringify({
          kind: "discovery#restDescription",
          name: "testapi",
          version: "v1",
          resources: {
            users: {
              methods: {
                list: {
                  id: "testapi.users.list",
                  path: "users",
                  httpMethod: "GET",
                  description: "Lists all users in the system",
                  parameters: {
                    maxResults: {
                      type: "integer",
                      location: "query",
                    },
                  },
                },
                insert: {
                  id: "testapi.users.insert",
                  path: "users",
                  httpMethod: "POST",
                  description: "Creates a new user",
                },
              },
            },
          },
        });

        const result = documentationSearch.extractRelevantSections(
          "",
          "users list",
          5,
          2000,
          googleDiscoverySpec,
        );

        expect(result).toContain("=== OPENAPI OPERATIONS ===");
        expect(result).toContain("testapi.users.list");
        expect(result).toContain("Lists all users");
        expect(result).toContain("GET");
      });
    });
  });

  describe("Sitemap and URL Ranking", () => {
    let strategy: PlaywrightFetchingStrategy;

    beforeEach(() => {
      strategy = new PlaywrightFetchingStrategy();
      vi.clearAllMocks();
      mockedAxios = axios as Mocked<typeof axios>;
      mockedAxios.get.mockReset();
      mockedAxios.post.mockReset();
      ({ mockPage, mockContext, mockBrowser } = createPlaywrightMocks());
    });

    describe("rankItems", () => {
      it("should filter out URLs with excluded keywords", () => {
        const urls = [
          "https://api.com/docs/getting-started",
          "https://api.com/pricing",
          "https://api.com/docs/authentication",
          "https://api.com/signup",
          "https://api.com/blog/updates",
        ];

        const keywords = ["docs", "authentication"];
        const ranked = strategy.rankItems(urls, keywords);

        // Should exclude pricing, signup, and blog completely
        expect(ranked).toHaveLength(2);
        expect(ranked[0]).toBe("https://api.com/docs/authentication");
        expect(ranked[1]).toBe("https://api.com/docs/getting-started");
        expect(ranked).not.toContain("https://api.com/pricing");
        expect(ranked).not.toContain("https://api.com/signup");
        expect(ranked).not.toContain("https://api.com/blog/updates");
      });

      it("should rank URLs by keyword match count divided by URL length", () => {
        const urls = [
          "https://example.com/v1/users/read/fast", // No 'api' in domain, 1 match
          "https://api.com/documentation/api/v1/users/endpoints", // Long, 2 matches
          "https://api.com/api/users", // Short, 2 matches
        ];

        const keywords = ["api", "users"];
        const ranked = strategy.rankItems(urls, keywords) as string[];

        // api/users should rank highest (2 matches, shortest URL with api)
        expect(ranked[0]).toBe("https://api.com/api/users");
        // Long URL with 2 matches should be second
        expect(ranked[1]).toBe(
          "https://api.com/documentation/api/v1/users/endpoints",
        );
        // URL with only 1 match should be last
        expect(ranked[2]).toBe("https://example.com/v1/users/read/fast");
      });

      it("should handle link objects with text", () => {
        const links = [
          { linkText: "API Reference", href: "https://api.com/reference" },
          { linkText: "Getting Started", href: "https://api.com/start" },
          { linkText: "Pricing Plans", href: "https://api.com/pricing" },
        ];

        const keywords = ["api", "reference"];
        const ranked = strategy.rankItems(links, keywords);

        expect(ranked).toHaveLength(2); // Pricing excluded completely
        expect(ranked[0]).toEqual({
          linkText: "API Reference",
          href: "https://api.com/reference",
        });
        expect(ranked[1]).toEqual({
          linkText: "Getting Started",
          href: "https://api.com/start",
        });
        expect(ranked).not.toContainEqual({
          linkText: "Pricing Plans",
          href: "https://api.com/pricing",
        });
      });

      it("should filter already fetched links when provided", () => {
        const urls = [
          "https://api.com/docs/intro",
          "https://api.com/docs/api",
          "https://api.com/docs/guide",
        ];

        const fetchedLinks = new Set(["https://api.com/docs/intro"]);
        const keywords = ["docs"];
        const ranked = strategy.rankItems(
          urls,
          keywords,
          fetchedLinks,
        ) as string[];

        expect(ranked).toHaveLength(2);
        expect(ranked).not.toContain("https://api.com/docs/intro");
      });
    });

    describe("Sitemap fetching", () => {
      it("should fetch and parse XML sitemap", async () => {
        const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://api.com/docs/intro</loc></url>
            <url><loc>https://api.com/docs/auth</loc></url>
            <url><loc>https://api.com/pricing</loc></url>
            <url><loc>https://api.com/docs/api</loc></url>
          </urlset>`;

        // Mock sitemap fetch
        mockedAxios.get.mockImplementation((url: string) => {
          if (url.includes("sitemap.xml")) {
            return Promise.resolve({ data: sitemapXml });
          }
          return Promise.reject(new Error("404"));
        });

        // Mock page fetches
        mockPage.evaluate.mockResolvedValue({
          html: "<html><body>Content</body></html>",
          textContent: "Content",
          links: {},
        });

        const doc = new DocumentationFetcher(
          {
            documentationUrl: "https://api.com/docs",
            keywords: ["api", "auth"],
          },
          {},
          metadata,
        );

        const result = await doc.fetchAndProcess();

        // Should fetch sitemap
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining("sitemap.xml"),
          expect.any(Object),
        );

        // Should have fetched pages (excluding pricing due to excluded keywords)
        expect(mockPage.goto).toHaveBeenCalled();
        expect(result).toContain("Content");
      });

      it("should handle sitemap index with nested sitemaps", async () => {
        const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
          <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <sitemap><loc>https://api.com/docs/sitemap.xml</loc></sitemap>
            <sitemap><loc>https://api.com/blog/sitemap.xml</loc></sitemap>
          </sitemapindex>`;

        const docsSitemap = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://api.com/docs/intro</loc></url>
            <url><loc>https://api.com/docs/api</loc></url>
          </urlset>`;

        mockedAxios.get.mockImplementation((url: string) => {
          if (
            url.includes("sitemap_index.xml") ||
            url === "https://api.com/sitemap.xml"
          ) {
            return Promise.resolve({ data: sitemapIndex });
          }
          if (url.includes("docs/sitemap.xml")) {
            return Promise.resolve({ data: docsSitemap });
          }
          return Promise.reject(new Error("404"));
        });

        mockPage.evaluate.mockResolvedValue({
          html: "<html><body>Docs</body></html>",
          textContent: "Docs",
          links: {},
        });

        const doc = new DocumentationFetcher(
          {
            documentationUrl: "https://api.com/docs",
            keywords: ["docs"],
          },
          {},
          metadata,
        );

        const result = await doc.fetchAndProcess();

        // Should fetch main sitemap and docs sitemap (not blog due to filtering)
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining("sitemap"),
          expect.any(Object),
        );
        expect(result).toContain("Docs");
      });

      it("should fall back to legacy crawling if no sitemap found", async () => {
        // All sitemap requests fail
        mockedAxios.get.mockRejectedValue(new Error("404"));

        // Mock initial page with links
        mockPage.evaluate.mockResolvedValueOnce({
          html: "<html><body>Main Page</body></html>",
          textContent: "Main Page",
          links: {
            "api reference https docs api": "https://api.com/docs/api",
            "getting started https docs start": "https://api.com/docs/start",
          },
        });

        const doc = new DocumentationFetcher(
          {
            documentationUrl: "https://api.com/docs",
            keywords: ["api"],
          },
          {},
          metadata,
        );

        const result = await doc.fetchAndProcess();

        // Should use legacy crawling
        expect(mockPage.goto).toHaveBeenCalled();
        expect(result).toContain("Main Page");
      });

      it("should respect MAX_FETCHED_LINKS limit", async () => {
        // Create a sitemap with many URLs
        const urls = Array.from(
          { length: 100 },
          (_, i) => `<url><loc>https://api.com/docs/page${i}</loc></url>`,
        ).join("");

        const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            ${urls}
          </urlset>`;

        mockedAxios.get.mockImplementation((url: string) => {
          if (url.includes("sitemap.xml")) {
            return Promise.resolve({ data: sitemapXml });
          }
          return Promise.reject(new Error("404"));
        });

        mockPage.evaluate.mockResolvedValue({
          html: "<html><body>Page</body></html>",
          textContent: "Page",
          links: {},
        });

        const doc = new DocumentationFetcher(
          {
            documentationUrl: "https://api.com/docs",
            keywords: ["docs"],
          },
          {},
          metadata,
        );

        await doc.fetchAndProcess();

        // Should respect the limit (default is 10)
        expect(mockPage.goto).toHaveBeenCalledTimes(
          server_defaults.DOCUMENTATION.MAX_FETCHED_LINKS,
        );
      });

      it("should filter sitemap URLs by path relevance", async () => {
        const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://api.com/docs/api/intro</loc></url>
            <url><loc>https://api.com/company/about</loc></url>
            <url><loc>https://api.com/docs/api/auth</loc></url>
            <url><loc>https://api.com/marketing/landing</loc></url>
          </urlset>`;

        mockedAxios.get.mockImplementation((url: string) => {
          // Return sitemap for the first matching candidate
          if (url.includes("sitemap.xml")) {
            return Promise.resolve({ data: sitemapXml });
          }
          return Promise.reject(new Error("404"));
        });

        mockPage.evaluate.mockResolvedValue({
          html: "<html><body>Content</body></html>",
          textContent: "Content",
          links: {},
        });

        const doc = new DocumentationFetcher(
          {
            documentationUrl: "https://api.com/docs/api",
            keywords: ["intro", "auth"], // Keywords that match the URLs
          },
          {},
          metadata,
        );

        await doc.fetchAndProcess();

        // Should have fetched some pages
        const calledUrls = mockPage.goto.mock.calls.map((call) => call[0]);
        expect(calledUrls.length).toBeGreaterThan(0);

        // Verify that URL filtering worked by checking the fetched URLs
        // The implementation filters at collection time, so we should only see relevant URLs
        expect(
          calledUrls.some(
            (url) => url.includes("intro") || url.includes("auth"),
          ),
        ).toBe(true);
      });

      it("should deduplicate similar page content based on similarity threshold", async () => {
        const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://api.com/docs/page1</loc></url>
            <url><loc>https://api.com/docs/page2</loc></url>
            <url><loc>https://api.com/docs/page3</loc></url>
            <url><loc>https://api.com/docs/page4</loc></url>
          </urlset>`;

        mockedAxios.get.mockImplementation((url: string) => {
          if (url.includes("sitemap.xml")) {
            return Promise.resolve({ data: sitemapXml });
          }
          return Promise.reject(new Error("404"));
        });

        // Mock page content with duplicates
        const uniqueContent1 =
          "Authentication API documentation with bearer token support and OAuth flows for secure access " +
          "x".repeat(500);
        const duplicateContent =
          "Authentication API documentation with bearer token support and OAuth flows for secure access " +
          "x".repeat(500);
        const uniqueContent2 =
          "Completely different content about webhooks and event subscriptions for real-time updates " +
          "y".repeat(500);

        let callCount = 0;
        mockPage.evaluate.mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              html: `<html><body>${uniqueContent1}</body></html>`,
              textContent: uniqueContent1,
              links: {},
            });
          } else if (callCount === 2) {
            return Promise.resolve({
              html: `<html><body>${duplicateContent}</body></html>`,
              textContent: duplicateContent,
              links: {},
            });
          } else if (callCount === 3) {
            return Promise.resolve({
              html: `<html><body>${uniqueContent2}</body></html>`,
              textContent: uniqueContent2,
              links: {},
            });
          } else {
            return Promise.resolve({
              html: `<html><body>${duplicateContent}</body></html>`,
              textContent: duplicateContent,
              links: {},
            });
          }
        });

        const doc = new DocumentationFetcher(
          {
            documentationUrl: "https://api.com/docs",
            keywords: ["api"],
          },
          {},
          metadata,
        );

        const result = await doc.fetchAndProcess();

        // Should have fetched multiple pages
        expect(mockPage.goto).toHaveBeenCalled();
        expect(callCount).toBeGreaterThan(1);

        // Result should contain unique content
        expect(result).toContain("Authentication API documentation");
        expect(result).toContain("webhooks and event subscriptions");

        // Count occurrences of the duplicate content - should only appear once
        const occurrences = (
          result.match(
            /Authentication API documentation with bearer token support/g,
          ) || []
        ).length;
        expect(occurrences).toBe(1);
      });
    });
  });
});
