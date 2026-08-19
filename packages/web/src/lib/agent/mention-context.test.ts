import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageReference, Run, System, Tool } from "@superglue/shared";
import { buildMentionContext, MENTION_CONTEXT_MARKER } from "./mention-context";
import type { ToolExecutionContext } from "./agent-types";

const toolRef: MessageReference = { type: "tool", id: "customer-sync", label: "Customer Sync" };
const systemRef: MessageReference = { type: "system", id: "gmail", label: "Gmail" };
const runRef: MessageReference = {
  type: "run",
  id: "4d19f789-cd0d-4430-b2e3-ac859127feac",
  label: "customer-sync · FAILED",
  status: "FAILED",
};

const sampleTool: Tool = {
  id: "customer-sync",
  name: "Customer Sync",
  instruction: "Sync customers nightly",
  steps: [
    {
      id: "step1",
      instruction: "Fetch customers",
      config: {
        url: "https://api.crm.example/customers",
        method: "GET",
        systemId: "crm",
        headers: { Authorization: "Bearer super-secret-step-token" },
        body: '{"secret":"payload"}',
      },
    },
  ],
};

const sampleSystem: System = {
  id: "gmail",
  name: "Gmail",
  url: "https://gmail.googleapis.com/gmail/v1",
  credentials: { api_key: "sk-live-abcdef123456" },
};

const sampleRun: Run = {
  runId: "4d19f789-cd0d-4430-b2e3-ac859127feac",
  toolId: "customer-sync",
  status: "FAILED" as Run["status"],
  error: "spawn deno ENOENT",
  data: { huge: "payload that must not reach the model" },
  stepResults: [{ stepId: "step1", success: false, error: "boom" } as any],
  metadata: { startedAt: "2026-08-18T12:00:00.000Z", durationMs: 1200 },
};

function makeCtx() {
  const client = {
    getWorkflow: vi.fn(async () => sampleTool),
    getSystem: vi.fn(async () => sampleSystem),
    getRun: vi.fn(async () => sampleRun),
  };
  return { ctx: { superglueClient: client } as unknown as ToolExecutionContext, client };
}

describe("buildMentionContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when there are no references", async () => {
    const { ctx } = makeCtx();
    expect(await buildMentionContext([], ctx)).toBeNull();
  });

  it("should start with the marker and the authoritative-target instruction", async () => {
    const { ctx } = makeCtx();
    const result = await buildMentionContext([toolRef], ctx);
    expect(result).toContain(MENTION_CONTEXT_MARKER);
    expect(result).toContain("authoritative targets");
  });

  it("should resolve a tool with its steps but without headers and bodies", async () => {
    const { ctx } = makeCtx();
    const result = (await buildMentionContext([toolRef], ctx))!;
    expect(result).toContain("customer-sync");
    expect(result).toContain("Sync customers nightly");
    expect(result).toContain("https://api.crm.example/customers");
    // The projection is deliberately narrow: request payload details stay out.
    expect(result).not.toContain("super-secret-step-token");
    expect(result).not.toContain('"secret":"payload"');
  });

  it("should mask system credentials and expose placeholders instead", async () => {
    const { ctx } = makeCtx();
    const result = (await buildMentionContext([systemRef], ctx))!;
    expect(result).toContain("<<gmail_api_key>>");
    expect(result).not.toContain("sk-live-abcdef123456");
  });

  it("should spell out the real system id next to the display-name token", async () => {
    const { ctx } = makeCtx();
    const result = (await buildMentionContext([systemRef], ctx))!;
    expect(result).toContain("SYSTEM @Gmail (id: gmail)");
  });

  it("should include run status and error but drop data and stepResults payloads", async () => {
    const { ctx } = makeCtx();
    const result = (await buildMentionContext([runRef], ctx))!;
    expect(result).toContain("spawn deno ENOENT");
    expect(result).toContain("full id: 4d19f789-cd0d-4430-b2e3-ac859127feac");
    expect(result).toContain("failedStepId");
    expect(result).not.toContain("payload that must not reach the model");
  });

  it("should tell the agent plainly when a mentioned tool no longer exists", async () => {
    const { ctx, client } = makeCtx();
    client.getWorkflow.mockResolvedValueOnce(null as any);
    const result = (await buildMentionContext([toolRef], ctx))!;
    expect(result).toContain("NO LONGER EXISTS");
    expect(result).toContain("Do not guess");
  });

  it("should resolve each entity only once when it is mentioned twice", async () => {
    const { ctx, client } = makeCtx();
    await buildMentionContext([toolRef, toolRef], ctx);
    expect(client.getWorkflow).toHaveBeenCalledTimes(1);
  });

  it("should report a load failure instead of throwing when the client errors", async () => {
    const { ctx, client } = makeCtx();
    client.getRun.mockRejectedValueOnce(new Error("network down"));
    const result = (await buildMentionContext([runRef], ctx))!;
    expect(result).toContain("Could not be loaded: network down");
  });
});

describe("buildMentionContext review findings", () => {
  it("should report a deleted system as no longer existing when the client throws 404", async () => {
    // The real SuperglueClient.getSystem throws on 404 (it never resolves null) -
    // the server message is "System not found".
    const { ctx, client } = makeCtx();
    client.getSystem.mockRejectedValueOnce(new Error("System not found"));
    const result = (await buildMentionContext([systemRef], ctx))!;
    expect(result).toContain("NO LONGER EXISTS");
    expect(result).not.toContain("Could not be loaded");
  });
});
