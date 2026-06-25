# CRITICAL: IF YOU MAKE CHANGES TO THIS FILE, YOU MUST TEST:
#
# Build and run:
#   docker build -f docker/Dockerfile -t superglue-test .
#   docker run -d --name sg-test --env-file .env -p 3001:3001 -p 3002:3002 superglue-test
#   # Wait ~15s for startup, then verify: curl -s http://localhost:3002/v1/health
#
# 1. Deno (tool execution uses Deno subprocesses):
#   curl -s -X POST http://localhost:3002/v1/tools/<toolId>/run \
#     -H "Authorization: Bearer <apiKey>" -H "Content-Type: application/json" -d '{}'
#   # Must return JSON with "runId" and "data" fields (not a 500 error)
#
# 2. File handling (@napi-rs/canvas for image/chart generation):
#   docker exec sg-test node -e "require('@napi-rs/canvas'); console.log('OK')"
#   # Must print "OK" (not "Cannot find module" or dlopen errors)
#
# 2b. sharp (image processing; native binary is NOT in the lockfile cross-platform):
#   docker exec sg-test node -e "require('sharp'); console.log('OK')"
#   # Must print "OK" (not "Could not load the sharp module using the linux-x64 runtime")
#
# 3. Playwright (headless Chromium for documentation scraping):
#   curl -s -X POST http://localhost:3002/v1/systems/<systemId>/documentation/scrape \
#     -H "Authorization: Bearer <apiKey>" -H "Content-Type: application/json" \
#     -d '{"url": "https://example.com"}'
#   # Use a URL without llms.txt so it falls through to Playwright.
#   # Check logs: docker logs sg-test | grep -i "example.com"
#   # Must show "Successfully fetched content" — NOT "Executable doesn't exist" or "Playwright fetch failed"
#
# 4. SIGTERM (graceful shutdown via tini):
#   docker kill --signal SIGTERM sg-test
#   docker logs sg-test | tail -5
#   # Must show: "SIGTERM received", "Shutdown complete"
#   docker inspect sg-test --format '{{.State.ExitCode}}'
#   # Must be 0
#
#   On SIGTERM the core server stops the scheduler (no new tasks), then drains
#   in-flight tool runs for up to 4h before closing the HTTP server. The Deno
#   workers are spawned detached (own process group) so `tini -g` does NOT kill
#   them mid-run — only the pool's drain tears them down. To actually allow the
#   drain to complete you MUST give the container enough stop grace, otherwise
#   it is SIGKILLed after the default 10s:
#     docker stop -t 14400 sg-test          # plain Docker: up to 4h
#     # k8s: terminationGracePeriodSeconds: 14400
#
# Cleanup: docker rm -f sg-test

# Build stage
FROM node:22-slim@sha256:80fdb3f57c815e1b638d221f30a826823467c4a56c8f6a8d7aa091cd9b1675ea AS builder

WORKDIR /usr/src/app

# Copy package files first to leverage layer caching
COPY package*.json ./
COPY turbo.json ./

# Copy workspace package.json files (separate layer for npm install caching)
COPY packages/core/package*.json ./packages/core/
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/
COPY tsconfig.json ./

# Install all dependencies (dev + prod) for building
RUN npm install && \
    npm install -g typescript next turbo

# Copy source code (selective — only what the build needs)
COPY packages/core ./packages/core
COPY packages/web ./packages/web
COPY packages/shared ./packages/shared

# Build all packages
RUN npm run build


# Production stage
FROM node:22-slim@sha256:80fdb3f57c815e1b638d221f30a826823467c4a56c8f6a8d7aa091cd9b1675ea

WORKDIR /usr/src/app

# Create non-root user and own the workdir so all subsequent nodejs writes work
RUN groupadd -r nodejs --gid=1001 && \
    useradd -r -g nodejs --uid=1001 --home-dir=/usr/src/app nodejs && \
    chown nodejs:nodejs /usr/src/app

# Install system dependencies (apt cache kept for playwright deps below)
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -y libxml2 && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        fontconfig fontconfig-config libfontconfig1 \
        libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0 \
        bash bubblewrap jq ripgrep coreutils grep sed gawk findutils \
        curl unzip ca-certificates tini \
        freetds-bin unixodbc tdsodbc && \
    curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
        -o /usr/local/share/ca-certificates/aws-rds-global-bundle.crt && \
    update-ca-certificates

# Install Deno (pinned — unpinned installs broke MSSQL TLS in v2.7.13)
RUN curl -fsSL https://deno.land/install.sh | sh -s -- v2.7.13 && \
    mv /root/.deno/bin/deno /usr/local/bin/deno && \
    deno --version

# Ensure Playwright installs browsers where the nodejs user can find them at runtime
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/src/app/.cache/ms-playwright

# Install Playwright system deps as root (apt cache available), then clean
RUN npx playwright install-deps chromium && \
    rm -rf /var/lib/apt/lists/*

# Prepare dirs for nodejs user
RUN mkdir -p /usr/src/app/.cache /usr/src/app/.npm && \
    chown nodejs:nodejs /usr/src/app/.cache /usr/src/app/.npm

# Copy package files and install production-only dependencies (as nodejs — no chown needed)
USER nodejs
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs packages/core/package*.json ./packages/core/
COPY --chown=nodejs:nodejs packages/web/package*.json ./packages/web/
COPY --chown=nodejs:nodejs packages/shared/package*.json ./packages/shared/
RUN npm ci --omit=dev && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        npm install --save-optional @napi-rs/canvas-linux-x64-gnu @img/sharp-linux-x64@0.34.5; \
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        npm install --save-optional @napi-rs/canvas-linux-arm64-gnu @img/sharp-linux-arm64@0.34.5; \
    fi

# Install Playwright browser AFTER node_modules so it matches the app's playwright version
RUN npx playwright install chromium

# Copy built files from builder stage
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/packages/web/.next ./packages/web/.next
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/packages/web/public ./packages/web/public
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/packages/web/src/lib/agent/skills/content ./packages/web/src/lib/agent/skills/content

# Copy Deno runtime (runs as TypeScript, no build needed)
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/packages/core/deno-runtime ./packages/core/deno-runtime

ENV DENO_DIR=/tmp/deno-cache
RUN deno cache --allow-import packages/core/deno-runtime/workflow-executor.ts || true

# Expose ports for both servers
EXPOSE 3001 3002

ENTRYPOINT ["tini", "-g", "--"]
CMD ["sh", "-c", "npx next start -p ${WEB_PORT:-3001} packages/web & exec node packages/core/dist/index.js"]
