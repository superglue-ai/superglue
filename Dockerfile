# Build stage
FROM node:22-slim AS builder

WORKDIR /usr/src/app

# Install required dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

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
RUN npx playwright install --with-deps
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

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm install -g next turbo cross-env

# Copy built files from builder stage
COPY --from=builder /usr/src/app/packages/core/dist ./packages/core/dist
COPY --from=builder /usr/src/app/packages/web/.next ./packages/web/.next
COPY --from=builder /usr/src/app/packages/web/public ./packages/web/public
COPY --from=builder /usr/src/app/packages/shared/dist ./packages/shared/dist

# Expose ports for both servers
EXPOSE 3000 3001

# Start both servers using turbo
CMD ["npm", "run", "start"]
