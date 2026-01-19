# ABOUTME: Dockerfile for the metadata extraction API service.
# ABOUTME: Builds and runs the Node.js/Hono API that connects to Chrome via CDP.

FROM node:22-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# Production stage
FROM node:22-alpine

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy config files (consent cookies, etc.)
COPY config ./config

# Add wget for healthcheck
RUN apk add --no-cache wget

EXPOSE 3000

CMD ["node", "dist/index.js"]
