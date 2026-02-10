FROM node:20-bookworm-slim

WORKDIR /app

ARG GEMINI_CLI_INSTALL=

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && mkdir -p /usr/share/keyrings \
  && curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" > /etc/apt/sources.list.d/google-cloud-sdk.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-cloud-cli \
  && gcloud components install cloud-code-enterprise --quiet \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY workflows ./workflows
COPY integrations ./integrations
COPY README.md ./README.md

RUN if [ -n "$GEMINI_CLI_INSTALL" ]; then sh -c "$GEMINI_CLI_INSTALL"; fi

ENV NODE_ENV=production

ENTRYPOINT ["npm", "run", "cli", "--"]
CMD ["list-workflows"]
