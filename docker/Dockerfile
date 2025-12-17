# Build stage
FROM node:22-slim AS builder
 
WORKDIR /usr/src/app

# Copy package files first to leverage layer caching
COPY package*.json ./
COPY turbo.json ./
COPY api.graphql ./

# Copy all package.json files
COPY packages/core/package*.json ./packages/core/
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/

# Copy tsconfig files
COPY tsconfig.json ./
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/web/tsconfig.json ./packages/web/
COPY packages/shared/tsconfig.json ./packages/shared/

# Install dependencies and build tools
RUN npm install && \
    npm install -g typescript next turbo

# Copy source code
COPY . .

# After copying files but before building
RUN npm run build
    

# Production stage
FROM node:22-slim

WORKDIR /usr/src/app

# Copy package files and configs
COPY package*.json ./
COPY turbo.json ./
COPY api.graphql ./
COPY packages/core/package*.json ./packages/core/
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/

# Install system dependencies first
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -y libxml2 && \ 
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        fontconfig fontconfig-config libfontconfig1 \
        libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0

# Install production dependencies and Playwright
RUN npm ci --omit=dev && \
    npm install --save-optional @napi-rs/canvas-linux-x64-gnu && \
    npm install -g next turbo cross-env && \
    npx playwright install --with-deps chromium

# Copy built files from builder stage
COPY --from=builder /usr/src/app/packages/core/dist ./packages/core/dist
COPY --from=builder /usr/src/app/packages/web/.next ./packages/web/.next
COPY --from=builder /usr/src/app/packages/web/public ./packages/web/public
COPY --from=builder /usr/src/app/packages/shared/dist ./packages/shared/dist

# Expose ports for both servers
EXPOSE 3000 3001 3002

# Start both servers using turbo
CMD ["npm", "run", "start"]