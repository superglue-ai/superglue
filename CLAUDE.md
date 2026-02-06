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
