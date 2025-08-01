---
title: "Self-Hosting Guide"
description: "Deploy and manage your own superglue instance"
---

This guide walks you through deploying and managing your own instance of superglue for complete control over your data processing pipeline.

## Prerequisites

Before you begin, ensure you have:

- Docker (version 20.10.0 or higher)
- Redis (version 6.0 or higher) for persistent storage
- OpenAI or Gemini API key
- At least 2GB of RAM and 1 CPU core
- Git (optional, for building from source)

## Deployment Options

### Option 1: Docker Compose (Recommended)

1. **Create a Docker Compose File**

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  superglue:
    image: superglueai/superglue:latest
    ports:
      - "3000:3000"  # GraphQL API
      - "3001:3001"  # Web Dashboard
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=${POSTGRES_DB:-superglue}
      - POSTGRES_USER=${POSTGRES_USERNAME}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

2. **Configure Environment Variables**

Copy `.env.example` to `.env` and fill in your values. Here are all available variables:

```env
# Port for the superglue server
GRAPHQL_PORT=3000

# Endpoint for the graphql api (used so the web dashboard knows where to find the server)
GRAPHQL_ENDPOINT=http://localhost:3000

# Port for the web dashboard 
WEB_PORT=3001
# Authentication token for API access
AUTH_TOKEN=your-secret-token

# Datastore type (redis, memory, file, or postgres)
DATASTORE_TYPE=file

# if file, the path to the datastore directory
# if not given or existing, the datastore will be created in the current directory
STORAGE_DIR=/data

# If POSTGRES: Database connection settings
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=superglue
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=superglue

# Encryption settings
# Optional: Master key for encrypting stored credentials
# If not set, credentials will be stored in plaintext
# Generate a strong key: openssl rand -hex 32
MASTER_ENCRYPTION_KEY=your-32-byte-encryption-key

# AI Provider - OPENAI or GEMINI
# best performance / price ratio right now is OpenAI with gpt-4.1
LLM_PROVIDER=GEMINI

# If OPENAI: Your OpenAI API key
# You can get one here : https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-XXXXXXXX
# OpenAI model to use. Use gpt-4.1 for best results.
OPENAI_MODEL=gpt-4.1
# Optional: Set a custom OpenAI API URL (for self-hosted models or providers like fireworks.ai)
# for fireworks, use https://api.fireworks.ai/inference/v1
OPENAI_BASE_URL=https://api.openai.com/v1

# If GEMINI: Your Google API key
# You can get one here : https://aistudio.google.com/app/apikey
GEMINI_API_KEY=XXXXXXX
# Gemini model to use. We recommend gemini-2.5-flash
GEMINI_MODEL=gemini-2.5-flash

# Disable the welcome/onboarding screen for development
NEXT_PUBLIC_DISABLE_WELCOME_SCREEN=false
```

3. **Start the Services**

```bash
docker-compose up -d
```

### Option 2: Manual Docker Setup

If you prefer more control over the container setup:

1. **Pull the Docker Image**

```bash
docker pull superglueai/superglue
```

1. **Start Redis (if using Redis datastore)**

```bash
docker run -d \
  --name superglue-redis \
  -v redis_data:/data \
  -p 6379:6379 \
  redis:6.2-alpine \
  redis-server --requirepass your-secure-password
```

**Or Start PostgreSQL (if using PostgreSQL datastore)**

```bash
docker run -d \
  --name superglue-postgres \
  -v postgres_data:/var/lib/postgresql/data \
  -p 5432:5432 \
  -e POSTGRES_DB=superglue \
  -e POSTGRES_USER=superglue \
  -e POSTGRES_PASSWORD=your-secure-password \
  postgres:15-alpine
```

4. **Start superglue**

```bash
docker run -d \
  --name superglue \
  --env-file .env \
  -p 3000:3000 \
  -p 3001:3001 \
  superglueai/superglue
```

## Health Checks and Monitoring

### Basic Health Check

```bash
curl http://localhost:3000/health
```

Expected response: `OK`

### Endpoints

- **Dashboard**: `http://localhost:3001/`
- **GraphQL Playground**: `http://localhost:3000/graphql`
- **MCP**: `http://localhost:3000/mcp`

## Other Considerations

1. **Network Security**
   - Use reverse proxy (nginx/traefik) for TLS termination
   - Implement IP whitelisting if needed
   - Keep access to the dashboard private since it is not protected by auth, or implement nginx basic auth to protect it

2. **Authentication**
   - Change default AUTH_TOKEN
   - Use strong db passwords
   - Rotate credentials regularly

3. **Credential Encryption**
   - Always set MASTER_ENCRYPTION_KEY in production
   - Store the master key securely (e.g., in a secrets manager)
   - Back up your master key - losing it means losing access to encrypted credentials
   - Use a strong, randomly generated key: `openssl rand -hex 32`

4. **Telemetry**
   - superglue uses telemetry to understand how many users are using the platform.
   - You can opt out by setting the DISABLE_TELEMETRY environment variable to true.

### Resource Allocation

Recommended minimum resources:

- 2 CPU cores
- 4GB RAM
- 20GB storage

### Logs

Access container logs:

```bash
# superglue logs
docker logs superglue

# Redis logs
docker logs superglue-redis

# PostgreSQL logs
docker logs superglue-postgres

# Follow logs
docker logs -f superglue
```

## Upgrading

1. **Pull Latest Image**

```bash
docker pull superglueai/superglue:latest
```

2. **Update Services**

```bash
docker-compose down
docker-compose up -d
```

## Support and Resources

- **Documentation**: [superglue Docs](https://docs.superglue.cloud)
- **GitHub Issues**: [Report bugs](https://github.com/superglue-ai/superglue/issues)
- **Discord Community**: [Join our Discord](https://discord.gg/SKRYYQEp)
- **Email Support**: stefan@superglue.cloud
