<p align="center">
  <img src="https://github.com/user-attachments/assets/be0e65d4-dcd8-4133-9841-b08799e087e7" width="350" alt="superglue_logo_white">
</p>

# Contributing to superglue

Thank you for your interest in superglue.

The best ways to contribute to superglue:

- Create and comment on [Issues](https://github.com/superglue-ai/superglue/issues)
- Open a PR referencing an open issue

We welcome contributions through GitHub pull requests. This document outlines our conventions regarding contributions, areas where we actively encourage contributions, development workflow and other resources. Our goal is to engage with the open-source community and to ensure that your contributions are accepted quickly, while ensuring high quality of contributions.

We gratefully welcome improvements to [documentation](https://docs.superglue.cloud/getting-started/introduction), the core application (this repo) and our [SDK](https://github.com/superglue-ai/superglue-js). We especially encourage contributions that address bugs and/or improve performance in the core application. We discourage contributions to the web package that are purely cosmetic, unless this contribution references an approved open issue.

In case you have any questions, feel free to join our [discord]((https://discord.gg/vUKnuhHtfW)) and come talk to us

> And if you like the project, but just don't have time to contribute code, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
>
> - Star the project;
> - Tweet about it;
> - Refer to this project in your project's readme;
> - Create and comment on [Issues](https://github.com/superglue-ai/superglue/issues)
> - Mention the project at local meetups and tell your friends/colleagues about superglue.

## Making contributions

_Before starting work on any significant contributions, please [open an issue]((https://github.com/superglue-ai/superglue/issues)). Discussing your proposed changes ahead of time will make the contribution process smooth for everyone. We discourage prospective contributors from working on changes and opening pull requests that do not reference an existing issue, since any changes that were not discussed beforehand are very likely to be rejected.

Once we've discussed your changes and you've got your code ready, make sure that all tests are passing and open your pull request. Note that we will be unable to merge your contributions unless you have signed the Contributor License Agreement (CLA). Failing to do so will result in your changes being rejected. A good first step is therefore to search for current open [issues](https://github.com/superglue-ai/superglue/issues). 

## Project Overview

### Tech we use

- Application (this repository)
  - Next.js, App Router (not Pages Router)
  - GraphQL backend (TypeScript)
  - Supabase
  - Postgres
  - LLMs (OpenAI, Claude, Gemini, etc.)
- [JS client SDK](https://github.com/superglue-ai/superglue-js))

### Architecture Overview

For an overview of Superglue’s architecture and foundational concepts, see the [Core Concepts](https://docs.superglue.cloud/getting-started/core-concepts) page.

## Repository Structure

```
/
├── packages/
│   ├── core/      # Backend core: GraphQL API, workflow engine, datastore, LLM, integrations
│   ├── web/       # Next.js 15 App Router frontend (TypeScript, shadcn/ui, Tailwind)
│   └── shared/    # Shared TypeScript code: types, utils, templates
├── docs/          # Markdown docs, guides, API reference, architecture
├── docker/        # Dockerfiles and scripts for local and production deployment
├── .github/       # GitHub Actions workflows
├── README.md      # Project overview and quickstart
├── CONTRIBUTING.md
├── LICENSE
```

- **`packages/core`**:  
  - Contains the backend GraphQL API (`graphql/`), workflow engine (`workflow/`), LLM integration (`llm/`), integration logic (`integrations/`), and datastore implementations (`datastore/` for Postgres, FileStore, Memory).
  - Tests are in `tests/` and alongside implementations.
- **`packages/web`**:  
  - Next.js 15 App Router frontend, using TypeScript, shadcn/ui, and Tailwind CSS.
  - UI components in `src/components/`, pages in `src/app/`.
- **`packages/shared`**:  
  - Shared TypeScript code (types, utils, templates) used by both backend and frontend.
- **`docs/`**:  
  - API reference, guides, and docs.
- **`docker/`**:  
  - Dockerfiles for backend, frontend, and local development.
- **Monorepo**:  
  - Managed with npm workspaces and turbo.

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Docker (for local Postgres, etc.)
- (Optional) We highly recommend Cursor/VSCode for best TypeScript/Next.js experience

### Quickstart

1. **Install dependencies:**
   ```sh
   npm install
   ```

2. **Start local dev environment:**
   ```sh
   # Start backend and frontend in dev mode
   npm run dev
   ```

3. **Run unit tests:**
   ```sh
   npm run test
   ```

4. **Build for production:**
   ```sh
   npm run build
   ```

5. **Docker:**
   - See `docker/DOCKER.md` for building and running images.

## Monorepo quickstart

- All packages are managed via npm workspaces.
- Use `npm run <script>` from the root to run scripts across packages.
- Each package (`core`, `web`, `shared`) has its own `package.json` for local scripts if needed.

## Running Unit Tests

- Run all tests from the root:
  ```sh
  npm run test
  ```
- Tests are located in `packages/core/tests/` and alongside implementation files.
- All tests must pass before merging.

## CI/CD

We use GitHub Actions for CI/CD, the configuration is in [`.github/workflows/node-test.yml`](https://github.com/superglue-ai/superglue/blob/main/.github/workflows/node-test.yml)

## License

superglue uses a Functional Source License. See [LICENSE](https://github.com/superglue-ai/superglue/blob/main/LICENSE) and [docs](https://docs.superglue.cloud/introduction) for more details.

When contributing to the superglue codebase, you need to agree to the [Contributor License Agreement](https://cla-assistant.io/superglue-ai/superglue). You only need to do this once and the CLA bot will remind you if you haven't signed it yet.
