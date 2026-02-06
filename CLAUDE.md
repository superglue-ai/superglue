# CLAUDE.md

## Quick Reference

```bash
npm run dev        # Start all (turbo)
npm run test       # Vitest
npm run lint:fix   # Prettier
npm run type-check # TS check
```

Ports: 3000 (GraphQL), 3001 (Web), 3002 (REST API)

## OSS vs EE

This is the **Enterprise Edition**. OSS at `../superglue`.

EE-only code lives in `ee/` subdirs:
- `packages/core/scheduler/` - cron scheduling
- `packages/core/notifications/` - Slack/email alerts
- `packages/core/api/ee/` - metrics, discovery, run-results, tool-history, api-key-scopes, webhooks, settings
- `packages/web/src/app/agent/` - AI agent chat

## Conventions

- **Imports at top** - no inline imports
- **KISS and DRY** - create classes, reuse components
- **Check utils first** - `packages/shared/utils.ts` has: `inferJsonSchema`, `generateUniqueId`, `maskCredentials`, `safeStringify`, `sampleResultObject`, etc.
- **Types in shared** - all types go in `packages/shared/types.ts`
- **REST over GraphQL** - new endpoints go in `packages/core/api/`, not graphql
- **Local imports use `.js` extension** - always `import { x } from "./file.js"` not `./file`
- **Error handling** - use `sendError(reply, 404, "message")` helper, never throw in handlers
- **Mapping functions** - name them `mapXToY` (e.g., `mapRunToOpenAPI`)
- **Dates in responses** - always `.toISOString()` for API responses

## After Completing a Feature

1. `npm run lint:fix` - format code
2. `npm run type-check` - catch type errors
3. `npm run test` - run tests if you touched tested code

## Adding a REST Endpoint

1. Create file in `packages/core/api/` (or `api/ee/` for EE features)
2. Use `registerApiModule` pattern:

```typescript
import { registerApiModule } from "./registry.js";
import { sendError, addTraceHeader } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

const myHandler: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { id: string };
  const metadata = authReq.toMetadata();
  
  const data = await authReq.datastore.someMethod({ orgId: authReq.authInfo.orgId });
  
  if (!data) {
    return sendError(reply, 404, "Not found");
  }
  
  return addTraceHeader(reply, authReq.traceId).code(200).send({ data });
};

registerApiModule({
  name: "my-feature",
  routes: [
    {
      method: "GET",
      path: "/my-endpoint",
      handler: myHandler,
      permissions: { type: "read", resource: "my-resource" },
    },
  ],
});
```

3. Import in `packages/core/api/ee/index.ts` (for EE) or appropriate index

Key types from `./types.ts`:
- `AuthenticatedFastifyRequest` - has `authInfo`, `datastore`, `workerPools`, `traceId`
- `RouteHandler` - `(request, reply) => Promise<any>`
- `RoutePermission` - `{ type, resource, allowRestricted?, checkResourceId? }`

## Adding Types

Add to `packages/shared/types.ts`. Export from `packages/shared/index.ts` if needed externally.

## Frontend Components

UI primitives in `packages/web/src/components/ui/` (shadcn/Radix based).

Pattern:
```typescript
import { cn } from "@/src/lib/general-utils";
import { Button } from "@/src/components/ui/button";
```

Use `cn()` for conditional classnames. Check existing UI components before creating new ones.

### Navigation

**Never use `<a href="...">` or `window.location.href` for internal navigation.** Always use Next.js router:

```typescript
import { useRouter } from "next/navigation";

const router = useRouter();
router.push("/path");
```

This ensures proper client-side navigation without full page reloads.


## Worker Pools

For async/CPU-intensive work:
```typescript
authReq.workerPools.toolExecution.runTask(runId, payload);
```

## Logging

```typescript
import { logMessage } from "../utils/logs.js";
logMessage("info", "message", { orgId, traceId });
```

## Tests

Use Vitest. File naming: `feature.test.ts` next to `feature.ts`.

Test descriptions: `"should [expected behavior] when [condition]"`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/logs.js", () => ({ logMessage: vi.fn() }));

describe("ModuleName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("functionName", () => {
    it("should return 404 when resource not found", async () => {
      // Arrange, Act, Assert
    });

    it("should create resource when valid input provided", async () => {
      // ...
    });
  });
});
```

Run single test file: `npm run test -- packages/core/api/my-feature.test.ts`

## API Response Formats

List endpoints:
```typescript
return reply.code(200).send({ data, page, limit, total, hasMore });
```

Single resource:
```typescript
return reply.code(200).send({ success: true, data });
```


## Agent Frontend & Backend Architecture

This describes the frontend / backend interaction of our agent interfaces and the tool backend.

### 1. Frontend Initiates a Request (`use-agent-request.ts`)

Every interaction starts when `sendAgentRequest()` is called. This happens in two scenarios:

**A) User types a message** — `sendAgentRequest("build me a tool that...")` is called with the user's text.
**B) User interacts with a tool component** (clicks Confirm, Decline, Request Fix, etc.) — the component calls `sendAgentRequest(undefined, { userActions: [{ type: "tool_event", toolCallId, toolName, event: "confirmed", payload }] })`.

Before firing the request, the frontend:
1. Drains the **action buffer** (`actionBufferRef`) — tool components can pre-buffer actions via `bufferAction()` that get bundled into the next request (e.g., manual run results from ToolBuilderComponent).
2. If there's an active stream and this isn't a "resume" (tool confirmation without new message), it **aborts the old stream** and marks any tools stuck in `awaiting_confirmation` as `declined`.
3. If the user typed a message, it **appends a user Message object** to local state immediately (optimistic UI).
4. Creates a **streaming assistant message** placeholder (or finds/resumes an existing one for tool confirmations).
5. Builds the `AgentRequest` payload: `{ agentId, messages, userMessage, userActions, filePayloads, hiddenContext, toolExecutionPolicies }`.
6. POSTs to `/api/agent/chat` and hands the SSE response body to `processStreamData()`.

### 2. Server Validates the Request (`agent-request.ts → validateAgentRequest`)

- Checks `agentId` is a valid `AgentType` (`main`, `playground`, `system_playground`).
- Resolves the agent definition from the registry — this determines which **tool set** and **system prompt generator** to use.
- Validates every `UserAction`: tool events must reference a known tool+event combo in `TOOL_EVENTS`, global events must exist in `GLOBAL_EVENTS`.
- Ensures the request has at least one of: `userMessage`, `userActions`, or `hiddenContext`.

### 3. Prepare Messages (`agent-request.ts → prepareMessages`)

This transforms raw frontend messages into the final message array the LLM will see:

**Step 3a — System prompt injection.** If no system message exists yet (`needsSystemMessage`), calls `agent.systemPromptGenerator(ctx)` to generate it and prepends it. The system prompt is also yielded back to the frontend as a `system_message` chunk so it is stored and  not re-injected on every request
**Step 3b — Process UserActions.** 

For each action in the array:
We determine whether it's a tool event, or a 'global' event (currently only used for file uploads), and process both all of them. Each tool defines a limited set of validated tool events that a tool call can emit.

- **Tool events** (e.g., `confirmed`, `declined`, `partial`, `request_fix`, `manual_run_success`):
  - Looks up the event definition in `TOOL_EVENTS[toolName][event]`.
  - If the event has a `statusUpdate`, mutates the tool's status and injects `confirmationState` + `confirmationData` into its output within the message history. This is how the frontend's button click gets "written into" the conversation.
  - Resolves the event's message template (e.g., `"[USER ACTION] The user clicked the confirm button..."`) with the action's payload.
  - Returns the resolved string as a **continuation**.

- **Global events** (e.g., `file_upload`):
  - Same template resolution, no message mutation.

**Step 3c — Build the edited user message.** Concatenates `hiddenContext` + all continuations + `userMessage` into a single user message and appends it. Deduplicates if the user message is already the last message in history.

### 4. Process Pending Confirmations (`agent-request.ts → processConfirmations`)

Before calling the LLM, the system scans **all assistant messages** for tool parts that have a `confirmationState` matching one of the tool's declared `validActions`. This is where deferred side-effects actually run:

- **`call_system` with `confirmationState: "confirmed"`** — Calls `processCallSystemConfirmation`, which actually executes the HTTP/Postgres/SFTP request now.
- **`create_system` / `edit_system` with `"confirmed"`** — Calls the superglue API to upsert the system, merging in the user-provided sensitive credentials.
- **`edit_tool` with `"confirmed"` / `"partial"` / `"declined"`** — Marks changes as approved/rejected, formats diff summaries.
- **`edit_payload` with `"confirmed"`** — Marks payload as applied.
- **`authenticate_oauth` with `"oauth_success"`** — Saves tokens to the system's credentials.

Each `processConfirmation` returns `{ output, status }`. The output replaces the tool's output in history, and the status becomes `"completed"` or `"declined"`. These results are yielded to the frontend as `tool_call_complete` chunks so the UI updates.

### 5. Build Tools for the LLM (`agent-request.ts → buildToolsForAISDK`)

For each tool name in the agent's `toolSet`:
1. Gets the `ToolRegistryEntry` and calls `definition()` to get the schema.
2. Calls `getEffectiveMode(toolName, userPolicies)` **without input** (input isn't known yet) to decide whether to attach an `execute` function.

**Policy resolution** (`getEffectiveMode`):
- If the tool has a `computeModeFromInput` function, call it. If it returns a mode, use it.
- If the tool allows user-configurable modes (`userModeOptions`) and the user has set one, use it.
- Otherwise, fall back to `defaultMode`.

**Which tools get `execute` attached:**
- `auto` and `confirm_after_execution` → YES, execute is attached.
- `confirm_before_execution` → NO execute. The LLM will call the tool, get `undefined` back, and the stream handler catches this.

Special case: `call_system` and `create_system`/`edit_system` have **dynamic modes**. At build time (no input), `computeModeFromInput` returns null, so they get execute attached. But at runtime with actual input, the mode may flip to `confirm_before_execution` (see Step 6b).

Also adds `web_search` (Tavily) if the API key is configured.

### 6. Stream LLM Response (`agent-client.ts → streamLLMResponse`)

Messages are converted to Vercel AI SDK format (`convertToAIMessages`), stripping `awaiting_confirmation` tools and skipping assistant text content when a tool in the same message succeeded. Then `streamText()` is called with a `stepCountIs(10)` limit.

The stream yields different part types:

#### 6a — `text-delta`
Plain text from the LLM. Yielded as `{ type: "content" }`. The frontend buffers these and "drips" them character by character for a typing animation.

#### 6b — `tool-call` (LLM decided to call a tool)
The effective mode is recalculated **with the actual input** this time. Then:

- **Mode is `confirm_before_execution` AND no execute function** → The tool was never executed. Generate `pendingOutput` via `buildPendingOutput()` (e.g., for `call_system`: `{ confirmationState: "pending", request: { url, method, ... } }`). Yield it as `tool_call_complete` with `status: "awaiting_confirmation"`, then yield `paused` and **return** (stop the stream). The frontend shows the confirmation UI.

- **Mode is `auto` or `confirm_after_execution`** → Execute was attached, so the tool runs. Continue to `tool-result`.

- **Dynamic flip case** (e.g., `call_system` where `computeModeFromInput` returns `confirm_before_execution` at runtime but execute was attached at build time): The `execute` generator detects this via a second `getEffectiveMode` check inside it and `return`s without doing anything, producing `undefined` output. The `tool-result` handler catches `output === undefined` for `confirm_before_execution` mode and does the same pause logic.

#### 6c — `tool-input-start`
Fired when the LLM starts writing a tool's input (before the full call). Yields a `tool_call_start` with a pre-generated ID so the frontend can show a "preparing tool..." state immediately.

#### 6d — `tool-result` (tool finished executing)

The execute function is an async generator (`executeToolWithLogs`) that:
1. Subscribes to logs via GraphQL subscription, filtered by traceId.
2. Kicks off `entry.execute(input, ctx)` as a non-blocking promise.
3. Polls in a 50ms loop, yielding `tool_call_update` chunks with accumulated logs.
4. When the promise resolves, yields the final `tool_call_complete`.
5. Pushes the result into `ctx.messages` so subsequent tool calls in the same LLM turn can see it.

Back in `streamLLMResponse`, the tool result is handled differently based on mode:

- **`confirm_after_execution`** → The tool already ran, but we yield the result with `status: "awaiting_confirmation"` and pause the stream. The frontend shows an approval UI (e.g., diff review for `edit_tool`). The LLM doesn't see this result until the user confirms and a new request comes in.

- **`auto`** → Yield `tool_call_complete` normally. The LLM loop continues — it sees the result and may call another tool or generate text.

#### 6e — `tool-error`
Yields an error result. The LLM sees it and can react.

#### 6f — `finish` / `error`
Stream ends. Special handling for "prompt too long" errors.

### 7. Frontend Processes the Stream (`use-agent-streaming.ts`)

`processStreamData` reads SSE lines from the response body:

- **`system_message`** → Prepends to message list.
- **`content`** → Buffers text and drips it into the current assistant message's last content part at ~30fps.
- **`tool_call_start`** → Adds a new tool part to the assistant message.
- **`tool_call_update`** → Updates tool with log entries (shown as expandable build/run logs).
- **`tool_call_complete`** → Finalizes tool output. Calls `config.onToolComplete` callback (used by playgrounds to sync state). Calls `updateToolCompletion` to update message state.
- **`paused`** → Marks the assistant message as `isStreaming: false` and returns. The conversation is now waiting for user action.
- **`done`** → Stream finished normally.

### 8. The Confirmation Round-Trip

When the stream pauses for confirmation, the frontend renders a tool-specific component:

- **`CallSystemComponent`** → Shows the request details, Execute/Cancel buttons, auto-execute policy selector.
- **`CreateSystemComponent` / `EditSystemComponent`** → Shows system config, credential input fields for sensitive values, Confirm/Cancel.
- **`ToolBuilderComponent` (fix mode)** → Shows diff approval UI with per-diff accept/reject, test-before-approve button.
- **`AuthenticateOAuthComponent`** → Shows OAuth button, handles popup flow.

When the user acts, the component calls `sendAgentRequest` with the appropriate `userActions`. This starts a new request cycle from Step 1. The action gets written into the message history (Step 3b), the confirmation gets processed (Step 4), and the LLM is called again with the updated context (Step 6).

## 9. Tool Categories by Policy

| Mode | Tools | Behavior |
|------|-------|----------|
| `auto` | `build_tool`, `run_tool`, `save_tool`, `find_tool`, `find_system`, `search_documentation`, `find_system_templates`, `get_runs` | Execute immediately, LLM sees result, no pause |
| `confirm_after_execution` | `edit_tool`, `edit_payload`, `authenticate_oauth` | Execute, then pause for user approval before LLM continues |
| `confirm_before_execution` (always) | `call_system` (default) | Don't execute until user confirms |
| `confirm_before_execution` (dynamic) | `create_system`, `edit_system` (only when `sensitiveCredentials` present) | Flip to confirm mode when secrets are needed; otherwise auto |
| `confirm_before_execution` (user-configurable) | `call_system` with user policy | User can set "ask every time", "run GETs only", or "run everything" |

## 10. Context & State

- **Draft tools** are stored entirely in message history. `findDraftInMessages()` scans tool outputs for matching `draftId`s — no separate draft store.
- **`ToolExecutionContext`** is the shared bag: `superglueClient`, `filePayloads`, `messages` (mutated by `executeToolWithLogs` during multi-step LLM turns), `subscriptionClient`, `abortSignal`, `toolExecutionPolicies`.
- **`convertToAIMessages`** prunes the history for the LLM: strips `awaiting_confirmation` tools entirely, strips assistant text from messages where a tool succeeded (to reduce noise), and normalizes all outputs to `{ type: "json", value }` or `{ type: "error-text", value }`.
- The **action buffer** (`actionBufferRef`) lets tool components queue feedback (e.g., manual run results) that gets bundled into the next request automatically.
```
