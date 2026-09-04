FROM node:22-bookworm-slim

ARG CODEX_VERSION=0.146.0
ARG CODEX_UID=1001
ARG CODEX_GID=1001
ARG CODEX_RUNNER_UID=1002
RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    openssl \
    procps \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global "@openai/codex@${CODEX_VERSION}" \
  && groupadd --gid "${CODEX_GID}" codex \
  && useradd --uid "${CODEX_UID}" --gid "${CODEX_GID}" \
    --create-home --home-dir /home/codex codex \
  && useradd --uid "${CODEX_RUNNER_UID}" --gid "${CODEX_GID}" \
    --create-home --home-dir /home/codex-runner codex-runner

WORKDIR /workspace/apps/site

COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY src ./src
COPY scripts/normalize-prisma-generated.mjs scripts/normalize-prisma-generated.mjs
COPY scripts/run-affiliate-agent-supervisor.ts scripts/run-affiliate-agent-supervisor.ts
COPY scripts/run-affiliate-agent-runner.ts scripts/run-affiliate-agent-runner.ts
RUN npx prisma generate --schema prisma/schema.prisma \
  && node scripts/normalize-prisma-generated.mjs

RUN printf '%s\n' \
  '#!/bin/sh' \
  'exec /workspace/apps/site/node_modules/.bin/tsx /workspace/apps/site/scripts/run-affiliate-agent-supervisor.ts "$@"' \
  > /usr/local/bin/affiliate-agent-supervisor \
  && printf '%s\n' \
  '#!/bin/sh' \
  'exec /workspace/apps/site/node_modules/.bin/tsx /workspace/apps/site/scripts/run-affiliate-agent-runner.ts "$@"' \
  > /usr/local/bin/affiliate-agent-runner \
  && chmod 0555 /usr/local/bin/affiliate-agent-supervisor /usr/local/bin/affiliate-agent-runner

ENV HOME=/tmp/codex \
  CODEX_HOME=/tmp/codex \
  PATH=/workspace/apps/site/node_modules/.bin:/usr/local/bin:/usr/bin:/bin \
  NODE_ENV=production

USER codex
CMD ["/usr/local/bin/affiliate-agent-supervisor"]
