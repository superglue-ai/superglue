---
title: "Self-Hosting Guide"
description: "Deploy and manage your own superglue instance"
---

This guide walks you through deploying and managing your own instance of Superglue for complete control over your data processing pipeline.

## Prerequisites

Before you begin, ensure you have:

- Docker (version 20.10.0 or higher)
- Redis (version 6.0 or higher) for persistent storage
- OpenAI API key with access to the recommended model
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
      - redis
    restart: unless-stopped

  redis:
    image: redis:6.2-alpine
    ports:
      - "6379:6379"
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

2. **Configure Environment Variables**

Create a `.env` file:

```env
# Server Configuration

# Port to run the superglue server
GRAPHQL_PORT=3000

# Port to run the web dashboard 
WEB_PORT=3001

# Endpoint the web interface will connect to
GRAPHQL_ENDPOINT=http://localhost:3000

# Authentication token for API access
AUTH_TOKEN=your-auth-token

# Datastore Configuration. Memory is faster but not persistent. Redis is slower but persistent.
DATASTORE_TYPE=redis or memory
# if redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=secret

# OpenAI Configuration
OPENAI_API_KEY=sk-...
# OpenAI model to use. We recommend gpt-4o-2024-11-20
OPENAI_MODEL=gpt-4o-2024-11-20
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

2. **Create a Docker Network**

```bash
docker network create superglue-network
```

3. **Start Redis**

```bash
docker run -d \
  --name superglue-redis \
  --network superglue-network \
  -v redis_data:/data \
  -p 6379:6379 \
  redis:6.2-alpine \
  redis-server --requirepass your-secure-password
```

4. **Start Superglue**

```bash
docker run -d \
  --name superglue \
  --network superglue-network \
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

### Monitoring Endpoints

- **Dashboard**: `http://localhost:3001/`
- **GraphQL Playground**: `http://localhost:3000/graphql`

## Other Considerations

1. **Network Security**
   - Use reverse proxy (nginx/traefik) for TLS termination
   - Implement IP whitelisting if needed
   - Keep access to the dashboard private since it is not protected by auth, or implement nginx basic auth to protect it

2. **Authentication**
   - Change default AUTH_TOKEN
   - Use strong Redis passwords
   - Rotate credentials regularly

3. **Telemetry**
   - Superglue uses telemetry to understand how many users are using the platform.
   - You can opt out by setting the DISABLE_TELEMETRY environment variable to true.

## Performance Tuning

### Redis Configuration

Optimize Redis for your workload:

```conf
maxmemory 2gb
maxmemory-policy allkeys-lru
appendonly yes
```

### Resource Allocation

Recommended minimum resources:

- 2 CPU cores
- 4GB RAM
- 20GB storage

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check if containers are running: `docker ps`
   - Verify network connectivity: `docker network inspect superglue-network`

2. **Authentication Failed**
   - Verify if the query params token or the Authorization Bearer is present and set to AUTH_TOKEN in the .env file
   - Check Redis credentials

3. **High Memory Usage**
   - Monitor Redis memory: `docker stats`
   - Adjust cache settings
   - Consider upgrading resources

### Logs

Access container logs:

```bash
# Superglue logs
docker logs superglue

# Redis logs
docker logs superglue-redis

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

- **Documentation**: [Superglue Docs](https://docs.superglue.cloud)
- **GitHub Issues**: [Report bugs](https://github.com/superglue-ai/superglue/issues)
- **Discord Community**: [Join our Discord](https://discord.gg/SKRYYQEp)
- **Email Support**: stefan@superglue.cloud
