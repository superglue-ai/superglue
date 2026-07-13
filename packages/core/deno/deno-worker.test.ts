import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { DenoWorker } from "./deno-worker.js";
import type { DenoWorkflowPayload } from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, "../deno-runtime/workflow-executor.ts");

vi.mock("../utils/logs.js", () => ({ logMessage: vi.fn() }));

let denoAvailable = false;
try {
  execSync("deno --version", { stdio: "pipe" });
  denoAvailable = true;
} catch {
  denoAvailable = false;
}

const SENSITIVE_ENV_KEYS = [
  "SUPERGLUE_API_KEY",
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "OPENAI_API_KEY",
];

function makePayload(overrides: Partial<DenoWorkflowPayload> = {}): DenoWorkflowPayload {
  return {
    runId: "test-run",
    workflow: {
      id: "test-tool",
      name: "Test Tool",
      steps: [],
    } as any,
    payload: {},
    credentials: {},
    systems: [],
    orgId: "test-org",
    traceId: "test-trace",
    userRoles: [],
    ...overrides,
  };
}

function makeTransformStep(
  code: string,
  id = "transform1",
  opts: { dataSelector?: string; failureBehavior?: string } = {},
) {
  return {
    id,
    config: { type: "transform", transformCode: code },
    ...(opts.dataSelector ? { dataSelector: opts.dataSelector } : {}),
    ...(opts.failureBehavior ? { failureBehavior: opts.failureBehavior } : {}),
  };
}

describe.skipIf(!denoAvailable)("DenoWorker", () => {
  let worker: DenoWorker;

  beforeEach(() => {
    worker = new DenoWorker({
      scriptPath: SCRIPT_PATH,
      memoryMb: 512,
      workflowTimeoutMs: 30_000,
    });
  });

  afterEach(() => {
    worker.kill();
  });

  describe("env var isolation", () => {
    it("should not expose server env vars via Deno.env.toObject()", async () => {
      const payload = makePayload({
        workflow: {
          id: "env-test",
          name: "Env Test",
          steps: [makeTransformStep("(input) => ({ envVars: Deno.env.toObject() })")],
        } as any,
      });

      const result = await worker.execute("env-test-run", payload);

      expect(result.success).toBe(true);
      const envVars = (result.data as any).envVars;
      for (const key of SENSITIVE_ENV_KEYS) {
        expect(envVars).not.toHaveProperty(key);
      }
    });

    it("should return undefined for server secrets via Deno.env.get()", async () => {
      const payload = makePayload({
        workflow: {
          id: "env-get-test",
          name: "Env Get Test",
          steps: [
            makeTransformStep(
              '(input) => ({ key: Deno.env.get("SUPERGLUE_API_KEY") || "NOT_FOUND" })',
            ),
          ],
        } as any,
      });

      const result = await worker.execute("env-get-run", payload);

      expect(result.success).toBe(true);
      expect((result.data as any).key).toBe("NOT_FOUND");
    });
  });

  describe("filesystem isolation", () => {
    it("should deny file reads", async () => {
      const payload = makePayload({
        workflow: {
          id: "fs-read-test",
          name: "FS Read Test",
          steps: [makeTransformStep('(input) => ({ file: Deno.readTextFileSync("/etc/passwd") })')],
        } as any,
      });

      const result = await worker.execute("fs-read-run", payload);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/permission|denied|read/i);
    });

    it("should deny file writes", async () => {
      const payload = makePayload({
        workflow: {
          id: "fs-write-test",
          name: "FS Write Test",
          steps: [
            makeTransformStep(
              '(input) => { Deno.writeTextFileSync("/tmp/pwned", "hi"); return {}; }',
            ),
          ],
        } as any,
      });

      const result = await worker.execute("fs-write-run", payload);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/permission|denied|write/i);
    });
  });

  describe("subprocess isolation", () => {
    it("should deny subprocess execution", async () => {
      const payload = makePayload({
        workflow: {
          id: "run-test",
          name: "Run Test",
          steps: [
            makeTransformStep(
              '(input) => { const p = new Deno.Command("whoami").outputSync(); return { out: p }; }',
            ),
          ],
        } as any,
      });

      const result = await worker.execute("run-test-run", payload);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/permission|denied|run/i);
    });
  });

  describe("basic transform execution", () => {
    it("should execute a simple transform successfully", async () => {
      const payload = makePayload({
        workflow: {
          id: "simple-transform",
          name: "Simple Transform",
          steps: [makeTransformStep("(input) => ({ doubled: [1,2,3].map(x => x * 2) })")],
        } as any,
      });

      const result = await worker.execute("simple-run", payload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ doubled: [2, 4, 6] });
    });

    it("should handle data operations", async () => {
      const payload = makePayload({
        payload: { items: [1, 2, 3, 4, 5] },
        workflow: {
          id: "data-ops",
          name: "Data Ops",
          steps: [
            makeTransformStep(
              "(input) => ({ filtered: input.items.filter(x => x > 2), sum: input.items.reduce((a, b) => a + b, 0) })",
            ),
          ],
        } as any,
      });

      const result = await worker.execute("data-ops-run", payload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ filtered: [3, 4, 5], sum: 15 });
    });
  });

  describe("abort handling", () => {
    it("should throw AbortError when aborted", async () => {
      const payload = makePayload({
        workflow: {
          id: "slow-transform",
          name: "Slow Transform",
          steps: [
            makeTransformStep("(input) => { let i = 0; while(i < 1e12) { i++; } return {}; }"),
          ],
        } as any,
      });

      const executePromise = worker.execute("abort-run", payload);

      await new Promise((r) => setTimeout(r, 500));
      worker.abort();

      await expect(executePromise).rejects.toMatchObject({
        name: "AbortError",
        message: expect.stringContaining("aborted"),
      });
    });
  });

  describe("loop step result shape", () => {
    it("should return array of {currentItem, data, success} envelopes for loop steps", async () => {
      const payload = makePayload({
        payload: { users: ["alice", "bob", "charlie"] },
        workflow: {
          id: "loop-shape-test",
          name: "Loop Shape Test",
          steps: [
            makeTransformStep(
              "(input) => ({ greeting: `hello ${input.currentItem}` })",
              "greetUsers",
              { dataSelector: "(input) => input.users" },
            ),
          ],
        } as any,
      });

      const result = await worker.execute("loop-shape-run", payload);

      expect(result.success).toBe(true);

      const stepResult = result.stepResults.find((s: any) => s.stepId === "greetUsers");
      expect(stepResult).toBeDefined();
      expect(Array.isArray(stepResult!.data)).toBe(true);

      const loopData = stepResult!.data as Array<{
        currentItem: unknown;
        data: unknown;
        success: boolean;
      }>;
      expect(loopData).toHaveLength(3);

      for (const envelope of loopData) {
        expect(envelope).toHaveProperty("currentItem");
        expect(envelope).toHaveProperty("data");
        expect(envelope).toHaveProperty("success");
        expect(envelope.success).toBe(true);
      }

      expect(loopData[0].currentItem).toBe("alice");
      expect(loopData[0].data).toEqual({ greeting: "hello alice" });
      expect(loopData[1].currentItem).toBe("bob");
      expect(loopData[2].currentItem).toBe("charlie");
    });

    it("should expose loop results as array of envelopes to downstream steps", async () => {
      const payload = makePayload({
        payload: { ids: [1, 2, 3] },
        workflow: {
          id: "loop-downstream-test",
          name: "Loop Downstream Test",
          steps: [
            makeTransformStep("(input) => ({ doubled: input.currentItem * 2 })", "doubleIds", {
              dataSelector: "(input) => input.ids",
            }),
            makeTransformStep(
              "(input) => ({ mapped: input.doubleIds.map(e => e.data.doubled) })",
              "aggregate",
            ),
          ],
        } as any,
      });

      const result = await worker.execute("loop-downstream-run", payload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ mapped: [2, 4, 6] });
    });

    it("should preserve per-item success/failure in loop envelopes with failureBehavior=continue", async () => {
      const payload = makePayload({
        payload: { items: [1, 0, 3] },
        workflow: {
          id: "loop-failure-test",
          name: "Loop Failure Test",
          steps: [
            makeTransformStep(
              "(input) => { if (input.currentItem === 0) throw new Error('zero'); return { val: input.currentItem }; }",
              "process",
              {
                dataSelector: "(input) => input.items",
                failureBehavior: "continue",
              },
            ),
          ],
        } as any,
      });

      const result = await worker.execute("loop-failure-run", payload);

      expect(result.success).toBe(true);

      const stepResult = result.stepResults.find((s: any) => s.stepId === "process");
      const loopData = stepResult!.data as Array<{
        currentItem: unknown;
        data: unknown;
        success: boolean;
        error?: string;
      }>;

      expect(loopData).toHaveLength(3);
      expect(loopData[0]).toMatchObject({ currentItem: 1, success: true, data: { val: 1 } });
      expect(loopData[1]).toMatchObject({ currentItem: 0, success: false, data: null });
      expect(loopData[1].error).toBeDefined();
      expect(loopData[2]).toMatchObject({ currentItem: 3, success: true, data: { val: 3 } });
    });

    it("should wrap non-loop step results in {currentItem, data, success} envelope", async () => {
      const payload = makePayload({
        payload: { x: 42 },
        workflow: {
          id: "no-loop-shape-test",
          name: "No Loop Shape Test",
          steps: [makeTransformStep("(input) => ({ result: input.x + 1 })", "addOne")],
        } as any,
      });

      const result = await worker.execute("no-loop-run", payload);

      expect(result.success).toBe(true);

      const stepResult = result.stepResults.find((s: any) => s.stepId === "addOne");
      expect(stepResult!.data).toEqual({
        currentItem: {},
        data: { result: 43 },
        success: true,
      });
    });

    it("should expose non-loop step data via .data to downstream steps", async () => {
      const payload = makePayload({
        payload: { x: 10 },
        workflow: {
          id: "non-loop-downstream-test",
          name: "Non-Loop Downstream Test",
          steps: [
            makeTransformStep("(input) => ({ value: input.x * 2 })", "step1"),
            makeTransformStep("(input) => ({ got: input.step1.data.value })", "step2"),
          ],
        } as any,
      });

      const result = await worker.execute("non-loop-downstream-run", payload);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ got: 20 });
    });
  });

  describe("SSRF protection", () => {
    function makeRequestStep(
      url: string,
      id = "ssrf-step",
      opts: { systemId?: string; method?: string } = {},
    ) {
      return {
        id,
        config: {
          type: "request",
          url,
          method: opts.method || "GET",
          ...(opts.systemId ? { systemId: opts.systemId } : {}),
        },
      };
    }

    function requestPayload(url: string, id = "ssrf") {
      return makePayload({
        workflow: { id, name: id, steps: [makeRequestStep(url)] } as any,
      });
    }

    // Cloud metadata endpoints are blocked unconditionally, regardless of config.
    describe("cloud metadata (always blocked)", () => {
      it("should block request to AWS IMDS endpoint", async () => {
        const result = await worker.execute(
          "ssrf-imds-run",
          requestPayload("http://169.254.169.254/latest/meta-data/", "ssrf-imds"),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
      });

      it("should block request to ECS task metadata endpoint", async () => {
        const result = await worker.execute(
          "ssrf-ecs-run",
          requestPayload("http://169.254.170.2/v2/credentials", "ssrf-ecs"),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
      });

      it("should block request to Alibaba metadata endpoint", async () => {
        const result = await worker.execute(
          "ssrf-alibaba-run",
          requestPayload("http://100.100.100.200/latest/meta-data/", "ssrf-alibaba"),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
      });

      it("should block request to Azure WireServer endpoint", async () => {
        const result = await worker.execute(
          "ssrf-azure-run",
          requestPayload("http://168.63.129.16/", "ssrf-azure"),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
      });

      it("should block request to GCP metadata hostname", async () => {
        const result = await worker.execute(
          "ssrf-gcp-run",
          requestPayload("http://metadata.google.internal/computeMetadata/v1/", "ssrf-gcp"),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
      });

      // IPv4-compatible IPv6 form of AWS IMDS (::169.254.169.254 normalizes to
      // ::a9fe:a9fe) must not smuggle the metadata IP past the always-on check.
      it.each(["::169.254.169.254", "::ffff:169.254.169.254"])(
        "should block request to metadata IP in IPv6 form %s",
        async (host) => {
          const result = await worker.execute(
            `ssrf-metadata-v6-${host}-run`,
            requestPayload(`http://[${host}]/latest/meta-data/`, `ssrf-metadata-v6-${host}`),
          );
          expect(result.success).toBe(false);
          expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
        },
      );
    });

    // Localhost / private ranges are only blocked when BLOCK_LOCAL_REQUESTS=true.
    describe("localhost & private ranges (BLOCK_LOCAL_REQUESTS=true)", () => {
      const previous = process.env.BLOCK_LOCAL_REQUESTS;

      beforeEach(() => {
        process.env.BLOCK_LOCAL_REQUESTS = "true";
      });

      afterEach(() => {
        if (previous === undefined) delete process.env.BLOCK_LOCAL_REQUESTS;
        else process.env.BLOCK_LOCAL_REQUESTS = previous;
      });

      it("should block request to localhost", async () => {
        const result = await worker.execute(
          "ssrf-localhost-run",
          requestPayload("http://localhost:3001", "ssrf-localhost"),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
      });

      it("should block request to loopback 127.0.0.1", async () => {
        const result = await worker.execute(
          "ssrf-loopback-run",
          requestPayload("http://127.0.0.1:8080/internal", "ssrf-loopback"),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
      });

      it("should block request to 0.0.0.0", async () => {
        const result = await worker.execute(
          "ssrf-zero-run",
          requestPayload("http://0.0.0.0:8080/", "ssrf-zero"),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
      });

      it.each(["10.0.0.1", "172.16.0.1", "192.168.1.1"])(
        "should block request to RFC1918 address %s",
        async (ip) => {
          const result = await worker.execute(
            `ssrf-rfc1918-${ip}-run`,
            requestPayload(`http://${ip}:8080/`, `ssrf-rfc1918-${ip}`),
          );
          expect(result.success).toBe(false);
          expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
        },
      );

      // fe80::/10 spans fe80–febf (link-local) and fc00::/7 spans fc00–fdff (ULA);
      // the guard must cover the whole range, not just the base hextet.
      it.each([
        "fe80::1",
        "fe90::1",
        "febf::1",
        "fc00::1",
        "fd12:3456::1",
        // IPv4-compatible IPv6 embedding a private IPv4 (::127.0.0.1, ::10.0.0.1)
        "::127.0.0.1",
        "::10.0.0.1",
      ])("should block request to IPv6 private/link-local address %s", async (ip) => {
        const result = await worker.execute(
          `ssrf-ipv6-${ip}-run`,
          requestPayload(`http://[${ip}]:8080/`, `ssrf-ipv6-${ip}`),
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/blocked request.*internal (host|address)/i);
      });
    });

    // With BLOCK_LOCAL_REQUESTS unset (default), external hosts must NOT be blocked.
    it("should not block an external host for SSRF reasons", async () => {
      const result = await worker.execute(
        "ssrf-external-run",
        requestPayload("https://example.com/", "ssrf-external"),
      );
      // May succeed or fail for network reasons, but never for SSRF blocking.
      if (!result.success) {
        expect(result.error).not.toMatch(/blocked request.*internal/i);
      }
    });
  });
});
