import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveStepContext,
  StepExecutionInput,
  StepExecutionStrategyRegistry,
} from "./strategy.js";
import { HttpStepExecutionStrategy } from "./http/http.js";
import { PostgresStepExecutionStrategy } from "./postgres/postgres.js";
import { FTPStepExecutionStrategy } from "./ftp/ftp.js";
import { SMBStepExecutionStrategy } from "./smb/smb.js";
import { TransformStepExecutionStrategy } from "./transform/transform.js";

vi.mock("../../utils/helpers.js", () => ({
  replaceVariables: vi.fn(async (template: string, _vars: any) => template),
  transformData: vi.fn(),
}));

function makeRequestInput(
  url: string,
  overrides: Partial<StepExecutionInput> = {},
): StepExecutionInput {
  return {
    stepConfig: { type: "request", url } as any,
    stepInputData: {},
    credentials: {},
    metadata: { orgId: "test", traceId: "test" } as any,
    ...overrides,
  };
}

function makeTransformInput(overrides: Partial<StepExecutionInput> = {}): StepExecutionInput {
  return {
    stepConfig: { type: "transform", transformCode: "return data;" } as any,
    stepInputData: { foo: "bar" },
    credentials: {},
    metadata: { orgId: "test", traceId: "test" } as any,
    ...overrides,
  };
}

describe("resolveStepContext", () => {
  it("should return resolvedUrl for request configs", async () => {
    const input = makeRequestInput("https://api.example.com");
    const ctx = await resolveStepContext(input);
    expect(ctx.resolvedUrl).toBe("https://api.example.com");
  });

  it("should return empty resolvedUrl for transform configs", async () => {
    const input = makeTransformInput();
    const ctx = await resolveStepContext(input);
    expect(ctx.resolvedUrl).toBe("");
  });

  it("should return empty resolvedUrl when url is undefined", async () => {
    const input = makeRequestInput(undefined as any);
    const ctx = await resolveStepContext(input);
    expect(ctx.resolvedUrl).toBe("");
  });
});

describe("StepExecutionStrategyRegistry routing", () => {
  let registry: StepExecutionStrategyRegistry;

  beforeEach(() => {
    registry = new StepExecutionStrategyRegistry();
    registry.register(new TransformStepExecutionStrategy());
    registry.register(new HttpStepExecutionStrategy());
    registry.register(new PostgresStepExecutionStrategy());
    registry.register(new FTPStepExecutionStrategy());
    registry.register(new SMBStepExecutionStrategy());
  });

  describe("HTTP routing", () => {
    it("should route http:// URLs to HttpStepExecutionStrategy", async () => {
      const input = makeRequestInput("http://api.example.com");
      const result = await registry.routeAndExecute(input);
      expect(result.error).not.toContain("Unsupported URL protocol");
    });

    it("should route https:// URLs to HttpStepExecutionStrategy", async () => {
      const input = makeRequestInput("https://api.example.com");
      const result = await registry.routeAndExecute(input);
      expect(result.error).not.toContain("Unsupported URL protocol");
    });
  });

  describe("Postgres routing", () => {
    it("should route postgres:// URLs to PostgresStepExecutionStrategy", async () => {
      const input = makeRequestInput("postgres://user:pass@localhost:5432/db");
      const result = await registry.routeAndExecute(input);
      expect(result.error).not.toContain("Unsupported URL protocol");
    });

    it("should route postgresql:// URLs to PostgresStepExecutionStrategy", async () => {
      const input = makeRequestInput("postgresql://user:pass@localhost:5432/db");
      const result = await registry.routeAndExecute(input);
      expect(result.error).not.toContain("Unsupported URL protocol");
    });
  });

  describe("FTP routing", () => {
    it("should route ftp:// URLs to FTPStepExecutionStrategy", async () => {
      const input = makeRequestInput("ftp://files.example.com/data.csv");
      const result = await registry.routeAndExecute(input);
      expect(result.error).not.toContain("Unsupported URL protocol");
    });

    it("should route ftps:// URLs to FTPStepExecutionStrategy", async () => {
      const input = makeRequestInput("ftps://files.example.com/data.csv");
      const result = await registry.routeAndExecute(input);
      expect(result.error).not.toContain("Unsupported URL protocol");
    });

    it("should route sftp:// URLs to FTPStepExecutionStrategy", async () => {
      const input = makeRequestInput("sftp://files.example.com/data.csv");
      const result = await registry.routeAndExecute(input);
      expect(result.error).not.toContain("Unsupported URL protocol");
    });
  });

  describe("SMB routing", () => {
    it("should route smb:// URLs to SMBStepExecutionStrategy", async () => {
      const input = makeRequestInput("smb://server/share/file.txt");
      const result = await registry.routeAndExecute(input);
      expect(result.error).not.toContain("Unsupported URL protocol");
    });
  });

  describe("Transform routing", () => {
    it("should route transform step configs to TransformStepExecutionStrategy", async () => {
      const input = makeTransformInput();
      const result = await registry.routeAndExecute(input);
      expect(result.error).not.toContain("Unsupported URL protocol");
    });
  });

  describe("Unsupported protocols", () => {
    it("should return error for unsupported protocol", async () => {
      const input = makeRequestInput("mailto:user@example.com");
      const result = await registry.routeAndExecute(input);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported URL protocol");
    });

    it("should return error for empty URL on request config", async () => {
      const input = makeRequestInput("");
      const result = await registry.routeAndExecute(input);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported URL protocol");
    });
  });

  describe("Strategy selection correctness", () => {
    it("should not route postgres:// to HTTP strategy", () => {
      const httpStrategy = new HttpStepExecutionStrategy();
      const input = makeRequestInput("postgres://localhost/db");
      expect(httpStrategy.shouldExecute(input, { resolvedUrl: "postgres://localhost/db" })).toBe(
        false,
      );
    });

    it("should not route http:// to FTP strategy", () => {
      const ftpStrategy = new FTPStepExecutionStrategy();
      const input = makeRequestInput("http://example.com");
      expect(ftpStrategy.shouldExecute(input, { resolvedUrl: "http://example.com" })).toBe(false);
    });

    it("should not route transform config to URL-based strategies", () => {
      const httpStrategy = new HttpStepExecutionStrategy();
      const pgStrategy = new PostgresStepExecutionStrategy();
      const ftpStrategy = new FTPStepExecutionStrategy();
      const smbStrategy = new SMBStepExecutionStrategy();
      const input = makeTransformInput();
      const resolved = { resolvedUrl: "" };

      expect(httpStrategy.shouldExecute(input, resolved)).toBe(false);
      expect(pgStrategy.shouldExecute(input, resolved)).toBe(false);
      expect(ftpStrategy.shouldExecute(input, resolved)).toBe(false);
      expect(smbStrategy.shouldExecute(input, resolved)).toBe(false);
    });

    it("should not route request config to transform strategy", () => {
      const transformStrategy = new TransformStepExecutionStrategy();
      const input = makeRequestInput("https://api.example.com");
      expect(
        transformStrategy.shouldExecute(input, { resolvedUrl: "https://api.example.com" }),
      ).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("should catch strategy execution errors and return them", async () => {
      const registry = new StepExecutionStrategyRegistry();
      registry.register({
        version: "1.0.0",
        shouldExecute: () => true,
        executeStep: () => {
          throw new Error("boom");
        },
      });

      const input = makeRequestInput("http://anything.com");
      const result = await registry.routeAndExecute(input);
      expect(result.success).toBe(false);
      expect(result.error).toBe("boom");
    });
  });

  describe("First-match wins", () => {
    it("should use the first matching strategy", async () => {
      const registry = new StepExecutionStrategyRegistry();
      const first = {
        version: "1.0.0",
        shouldExecute: () => true,
        executeStep: async () => ({ success: true, strategyExecutionData: { from: "first" } }),
      };
      const second = {
        version: "1.0.0",
        shouldExecute: () => true,
        executeStep: async () => ({ success: true, strategyExecutionData: { from: "second" } }),
      };
      registry.register(first);
      registry.register(second);

      const input = makeRequestInput("http://anything.com");
      const result = await registry.routeAndExecute(input);
      expect(result.strategyExecutionData.from).toBe("first");
    });
  });
});
