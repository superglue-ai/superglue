# Build stage using pre-built base image

# Use DockerHub image
FROM superglueai/superglue-base:latest AS builder

WORKDIR /usr/src/app

# Copy all source code (including potentially updated package.json files)
COPY . .

# Update dependencies - ensure any new or updated dependencies are installed
RUN npm install

# Build the application
RUN npm run build

# Production stage using pre-built base image
FROM superglueai/superglue-base:latest

WORKDIR /usr/src/app

# Copy built files from builder stage
COPY --from=builder /usr/src/app/packages/core/dist ./packages/core/dist
COPY --from=builder /usr/src/app/packages/web/.next ./packages/web/.next
COPY --from=builder /usr/src/app/packages/web/public ./packages/web/public
COPY --from=builder /usr/src/app/packages/shared/dist ./packages/shared/dist

# Expose ports for both servers
EXPOSE 3000 3001

# Start both servers using turbo
CMD ["npm", "run", "start"]
