# Docker Build Process

This project supports two Docker deployment approaches:

1. Monolithic - Single container with both web and server
2. Microservices - Separate containers for web and server

## Quick Start

## Option 1: Monolithic Deployment

Single container running both web and server services:

```bash
# Build the image
docker build -t superglue:latest -f docker/Dockerfile .

# Quick testing (data lost on restart)
docker run -p 3000:3000 -p 3001:3001 -p 3002:3002 --env-file .env superglue:latest

# Production/Development with data persistence
docker run -p 3000:3000 -p 3001:3001 -p 3002:3002 -v superglue_data:/data --env-file .env superglue:latest
```

## Option 2: Microservices Deployment

Separate containers for better scalability and resource management:

```bash
# Build and run both services
docker-compose up

# Build and run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## CI/CD Integration

1. **Nightly Base Image Workflow** (`.github/workflows/nightly-base-image.yml`):
   - Builds a multi-architecture base image daily (2am UTC)
   - Pushes to DockerHub as `superglueai/superglue-base:latest`

2. **Application Image Workflow** (`.github/workflows/docker-publish.yml`):
   - Triggered on pushes to main, updates dependencies from base image
   - Pushes to DockerHub as `superglueai/superglue:latest`
