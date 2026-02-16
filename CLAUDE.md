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
- **Object params for functions** - use `{ param1, param2 }` destructuring for exported functions and functions with 3+ parameters

## After Completing a Feature

1. `npm run lint:fix` - format code
2. `npm run type-check` - catch type errors
3. `npm run test` - run tests if you touched tested code

## Rebasing on Main

When rebasing a feature branch onto main, follow this approach:

### Core Principles
1. **Always ask about conflicts** - never make assumptions about which version to keep
2. **Verify against source of truth** - check actual state (DB schema, API contracts, config files, etc.)
3. **Understand what changed** - investigate why main's version differs from yours
4. **Make informed decisions** - resolve based on context, not convenience

### Process
```bash
git rebase main
```

When conflicts occur:

1. **Understand both versions**:
   ```bash
   git show HEAD:path/to/file          # Main's version
   git show COMMIT_HASH:path/to/file   # Your branch's version
   git diff HEAD...BRANCH              # See all differences
   ```

2. **Verify against reality**:
   - **Database**: Query actual schema, check for views vs tables
   - **APIs**: Verify endpoint contracts, response shapes
   - **Environment**: Check actual env vars, config files
   - **Dependencies**: Confirm installed package versions
   - **External services**: Validate integration requirements

3. **Ask when unclear**:
   - "What changed in main that caused this conflict?"
   - "Which version matches the actual [database/API/config]?"
   - "Are there related changes I should be aware of?"

4. **Resolve intelligently**:
   - Don't blindly merge both versions
   - Don't assume your branch is more up-to-date
   - Check for subtle differences (field names, types, nullability)
   - Remove references to non-existent resources

5. **After resolving**:
   ```bash
   git add <resolved-files>
   git rebase --continue
   ```

### Common Pitfalls
- **Merging both without verification** - creates invalid code
- **Assuming field names match** - `end_user_id` in code might be `user_id` in DB
- **Ignoring auto-generated files** - often safer to use one version entirely
- **Not checking data sources** - frontend may use different endpoints than backend
- **Skipping validation** - always verify the resolution makes sense

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
