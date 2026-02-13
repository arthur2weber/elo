# Build stage
FROM node:20-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# Clean install including devDependencies for building
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY README.md ./README.md

# Build the project
RUN npm run build

# Runtime stage
FROM node:20-bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    iproute2 \
    nmap \
    libsqlite3-0 \
  && mkdir -p /usr/share/keyrings \
  && curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" > /etc/apt/sources.list.d/google-cloud-sdk.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-cloud-cli \
  && rm -rf /var/lib/apt/lists/*

# Copy built files and dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts ./scripts
COPY README.md ./README.md

ARG GEMINI_CLI_INSTALL=
ARG GEMINI_GCLOUD_COMPONENT=
RUN if [ -n "$GEMINI_CLI_INSTALL" ]; then sh -c "$GEMINI_CLI_INSTALL"; fi
RUN if [ -n "$GEMINI_GCLOUD_COMPONENT" ]; then gcloud components install "$GEMINI_GCLOUD_COMPONENT" --quiet; fi

ENV NODE_ENV=production
# Default to server mode (active brain) but allow overriding for CLI tasks
ENTRYPOINT ["node"]
CMD ["dist/server/index.js"]
