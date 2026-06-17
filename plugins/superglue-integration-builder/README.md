# Superglue Agent Plugin

This plugin packages a focused agent workflow for Superglue maintainers and users. It is designed to be useful in Codex, Claude Code, Claude Cowork, Copilot-style coworkers, and other `SKILL.md`-compatible harnesses.

The plugin does not add a runtime dependency to Superglue. It gives agents a precise operating procedure, expected outputs, and plugin evals so maintainers can decide whether agent-produced work is good enough to accept.

## What It Includes

- Codex and Claude plugin manifests.
- A Superglue-specific skill at `skills/superglue-integration-builder/SKILL.md`.
- Plugin eval cases in `evals/superglue-integration-builder/cases.jsonl`.
- Privacy-safe measurement guidance for teams that want production plugin metrics.

## Primary Workflows

- Api/schema discovery.
- Connector mapping review.
- Auth boundary check.
- Integration regression pack.

## Eval Cases

- `schema-map`: Design a Superglue integration that maps CRM contacts into a billing customer API.
- `auth-review`: Review a generated integration plan for OAuth and API-key risks.
- `regression-pack`: Create plugin eval cases for a Superglue connector that syncs customer status changes.

## Install In An Agent Harness

Use this plugin directory directly from the repository when your harness supports local or Git-backed plugin sources. The plugin root is:

```text
plugins/superglue-integration-builder
```

For Telvine-backed distribution and metrics:

```bash
npm i -g telvine
telvine login
telvine publish ./plugins/superglue-integration-builder
telvine plugins metrics
```

## Telemetry Boundary

The plugin should only record metadata about plugin execution and eval outcomes. Do not record prompts, source files, request bodies, connector payloads, credentials, model outputs, or production user data.
