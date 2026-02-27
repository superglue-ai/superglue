# Docker Build Process

## Quick Start

### Option 1: All-in-One (Web + API)

Single container running both the web dashboard and API server:

```bash
# Using docker compose (starts just superglue, bring your own postgres)
docker compose up

# With bundled postgres + minio
docker compose --profile infra up

# Or build and run manually
docker build -t superglue:latest -f docker/Dockerfile .
docker run -p 3001:3001 -p 3002:3002 --env-file .env superglue:latest
```

### Option 2: Server Only (API without Web UI)

Lighter container running only the API server:

```bash
docker build -t superglue-server:latest -f docker/Dockerfile.server .
docker run -p 3002:3002 --env-file .env superglue-server:latest
```

## Ports

| Port | Service |
|------|---------|
| 3001 | Web dashboard (Next.js) |
| 3002 | REST API |

## Docker Compose Profiles

| Command | What starts |
|---------|------------|
| `docker compose up` | superglue only |
| `docker compose --profile infra up` | superglue + postgres + minio |
| `docker compose --profile all up` | same as infra |
