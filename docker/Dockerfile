# Build stage
FROM node:22-slim AS builder
 
WORKDIR /usr/src/app

COPY package*.json ./
COPY turbo.json ./

COPY packages/core/package*.json ./packages/core/
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/

COPY tsconfig.json ./
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/web/tsconfig.json ./packages/web/
COPY packages/shared/tsconfig.json ./packages/shared/

RUN npm install && \
    npm install -g typescript next turbo

COPY . .

RUN npm run build


# Production stage
FROM node:22-slim

WORKDIR /usr/src/app

COPY package*.json ./
COPY turbo.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/

# Install system dependencies first
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -y libxml2 && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        curl \
        sendmail \
        fontconfig fontconfig-config libfontconfig1 \
        libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install production dependencies and Playwright
RUN npm ci --omit=dev && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        npm install --save-optional @napi-rs/canvas-linux-x64-gnu; \
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        npm install --save-optional @napi-rs/canvas-linux-arm64-gnu; \
    fi && \
    npm install -g next turbo cross-env && \
    npx playwright install --with-deps chromium && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

COPY --from=builder /usr/src/app/packages/core/dist ./packages/core/dist
COPY --from=builder /usr/src/app/packages/web/.next ./packages/web/.next
COPY --from=builder /usr/src/app/packages/web/public ./packages/web/public
COPY --from=builder /usr/src/app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /usr/src/app/packages/web/src/lib/agent/skills/content ./packages/web/src/lib/agent/skills/content

EXPOSE 3001 3002

CMD ["npm", "run", "start"]
