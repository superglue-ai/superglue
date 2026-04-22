# superglue Concepts

superglue is an integration platform that builds and runs deterministic multi-step workflows ("tools") connecting APIs, databases, file servers and other systems. superglue agents generate tool configurations during building — execution is deterministic JavaScript, no LLMs involved.

## Tools

A tool is a saved, reusable workflow with an `id`, ordered `steps`, optional `outputTransform`/`outputSchema`, and optional `inputSchema` for payload validation. See the tool-building skill for the full config schema.

## Systems

Reusable building blocks containing connection info + credentials for external services. Each system has an `id`, `url` (base URL with protocol), `credentials`, optional `specificInstructions`, and optional `documentationFiles`. See the systems-handling skill for more details.

## Steps

Each step is one atomic operation — a single API call, database query, file operation, or JavaScript transformation. Steps have a camelCase `id` (becomes the key in sourceData), an optional `dataSelector` controlling loop behavior, a `config` (either request or transform), and optional `failureBehavior` ("fail" | "continue").

Request steps have: optional `systemId` (makes system credentials available as `<<systemId_credKey>>` variables — omit for public APIs), `url`, `method`, `headers`, `queryParams`, `body`, optional `pagination`.
Transform steps have: `type: "transform"` (required discriminator) and `transformCode`.

## Execution Pipeline

`ToolExecutor.execute({ payload, credentials, options })`:

1. **Validate** tool structure (id, steps array, URLs on request steps)
2. **For each step in order:**
   a. Build aggregated data: `{ ...originalPayload, ...previousStepResults }`
   b. Resolve system credentials (refresh OAuth if needed), namespace as `systemId_key`
   c. Run `dataSelector` → object means single execution, array means loop
   d. For each item: merge `currentItem` into input and execute
   e. Wrap result: `{ currentItem, data, success }`
   f. On failure: abort if `failureBehavior !== "continue"`
3. **Output transform** (if present): run JS function, validate against outputSchema
4. **Response filters** (if present): remove/mask/fail on pattern matches

## Strategy Routing

Steps are routed to execution strategies by protocol (first match wins):

1. Transform steps → if `config.type === "transform"`
2. HTTP → URL starts with `http://` or `https://`
3. PostgreSQL → URL starts with `postgres://` or `postgresql://`
4. MSSQL/Azure SQL → URL starts with `mssql://` or `sqlserver://`
5. Redis → URL starts with `redis://` or `rediss://`
6. FTP/SFTP → URL starts with `ftp://`, `ftps://`, or `sftp://`
7. SMB → URL starts with `smb://`

All user-provided JS (data selectors, transforms, stop conditions) runs in an isolated sandbox. See data-handling skill for constraints.

## File Handling

Load the file-handling skill for file detection, parsing, `file::` syntax, aliases, and transform access patterns.

## Deployments

There are four primary deployment patterns, each optimized for a different runtime model.

### 1) API + SDK (Python/TypeScript) in your application codebase

Documentation: https://docs.superglue.cloud/sdk/overview

Use this when tools should run inside product logic, backend jobs, webhooks, or request handlers.

**How it works**

- Your app calls superglue via REST API or SDK
- You pass a payload (and optionally credentials/context) to a specific tool
- superglue executes deterministically and returns structured results

**When to choose this**

- Real-time user-triggered workflows
- Backend orchestration across your own services
- Programmatic retries, branching, and composition with existing app logic
- Tight observability and error handling in your app stack and on the superglue web app

### 2) Scheduler (web interface)

Documentation: https://docs.superglue.cloud/enterprise/scheduling

Use this when a tool should run automatically on a fixed cadence without app code invoking it each time.

**How it works**

- Configure schedule(s) for a tool in the web UI
- superglue triggers execution at the specified interval/timezone
- Runs are tracked and visible in platform history/logging

**When to choose this**

- Polling third-party systems for updates
- Periodic syncs, enrichment, reporting, or data hygiene tasks
- Recurring maintenance workflows that do not require user interaction

**Recommended setup**

1. Make the tool idempotent (safe if triggered again)
2. Define a schedule with explicit timezone and interval
3. Provide any static payload defaults required by the workflow
4. Validate first runs in staging before enabling in production
5. Set up alerting/monitoring on failure rates and duration. superglue has a dedicated notifications feature for this. You can find it under Control Panel -> Notifications. Enterprise-only.

### 3) MCP deployment (for agent interfaces)

Documentation: https://docs.superglue.cloud/mcp/using-the-mcp

Use this when LLM agents (Cursor, Claude Desktop, Langdock, custom MCP clients, etc.) should discover and run superglue tools as callable functions.

**How superglue MCP works**

- The superglue MCP is designed to provide an interface for an LLM to execute your pre-built superglue tools
- Agent clients connect once, discover available tool definitions, then invoke them with structured inputs
- superglue executes the underlying deterministic workflow and returns normalized output to the agent runtime

**Setup model**

1. Run/connect to the superglue MCP server endpoint
2. Configure client authentication by providing your sg API key and setting up the correct endpoint (e.g. "https://mcp.superglue.ai" on hosted) in MCP client config
3. Verify discovery works (tool list is visible in the agent client)
4. The API key that is used to authenticate determines which tools are accessible via MCP. Mirrors your API keys RBAC access rules.

**Example Setup in Cursor**

{
"mcpServers": {
"superglue": {
"command": "npx",
"args": [
"mcp-remote",
"https://mcp.superglue.ai",
"--header",
"Authorization:${AUTH_HEADER}"
],
"env": {
"AUTH_HEADER": "Bearer {YOUR_SUPERGLUE+API_KEY}"
}
}
}
}

Refer to your MCP client's documentation to get your client-specific setup instructions for installing mcp servers.

### 4) CLI deployment

Install via: npm install -g @superglue/cli
Documentation: https://docs.superglue.cloud/getting-started/cli-skills

Use this when your agent uses skills, has bash tool access and wants to run non-persisted tools on the fly without building them first. More powerful than MCP. Supports system creation, tool building and saving, and tool execution on the fly without saving.

**How it works**

- The CLI authenticates to superglue via your API key and inherits your RBAC access rules
- Output is returned in terminal-friendly format for humans and agents

**Recommended setup**

1. Install/configure CLI in target environment
2. Authenticate via env vars or CLI init flow
3. Validate available systems/tools before roll out
4. Provide your agent with explicit instructions: whether to run tools on the fly, only execute pre-saved tools or allow creation and set up of new tools and systems

**CLI command reference**

Usage: sg [options] [command]

superglue CLI — build, run, and manage integration tools

Options:
-V, --version output the version number
--api-key <key> superglue API key
--endpoint <url> superglue API endpoint
--json force JSON output
-h, --help display help for command

Commands:
init [options] Set up superglue CLI configuration
update [options] Update the superglue CLI to the latest version
skill [topic] Print the superglue skill reference (SKILL.md) for AI agents
tool Manage superglue tools
system Manage superglue systems
run View tool execution runs
help [command] display help for command

IMPORTANT FOR AI AGENTS:
Before using the sg CLI, you MUST read the skill reference for complete usage
instructions, patterns, and examples:

    sg skill                        Print the main SKILL.md reference
    sg skill databases              Print the databases reference
    sg skill integration            Print the SDK/REST/webhook reference
    sg skill file-servers           Print the file servers reference
    sg skill data-handling          Print the data handling reference
    sg skill file-handling          Print the file handling reference
    sg skill http-apis              Print the HTTP APIs reference
    sg skill redis                  Print the Redis reference

The main skill reference covers: tool building, system setup, OAuth flows,
credential handling, variable syntax, data selectors, and common pitfalls.
DO NOT attempt to use sg commands without reading the skill reference first.

All Commands:
sg init Set up CLI configuration

sg tool build --config <file> Build a tool from a JSON config
sg tool build --id <id> --instruction <text> Build a tool from flags (requires --steps)
sg tool run --tool <id> [--payload <json>] Run a saved tool
sg tool run --draft <id> [--payload <json>] Run a draft tool
sg tool run --config <json> [--payload <json>] Run inline config
sg tool edit --tool <id> --patches <json> Edit a tool via JSON Patch
sg tool edit --draft <id> --patches <json> Edit a draft via JSON Patch
sg tool save --draft <id> Save a draft to the server
sg tool list List all saved tools
sg tool find [query] Search tools by keyword
sg tool find --id <id> Get full config of a tool

sg system create --config <file> Create a system from JSON config
sg system create --name <name> --url <url> Create a system from flags
sg system edit --id <id> Edit a system's configuration
sg system list List all systems
sg system find [query] Search systems by keyword
sg system find --id <id> Get full config of a system
sg system call --url <url> [--method GET] Call an API, database, or file server
sg system search-docs --system-id <id> -k <kw> Search system documentation
sg system oauth --system-id <id> --scopes <s> Authenticate a system via OAuth

sg run list [toolId] List runs, optionally filtered by tool
sg run get <runId> Get details of a specific run

sg skill [topic] Print skill reference for AI agents
sg update Update CLI to latest version
sg update --check Check for available updates

Global Flags:
--api-key <key> Override API key from config
--endpoint <url> Override API endpoint from config
--json Force JSON output (default in non-TTY)
