FROM oven/bun:1.3.14-debian AS bun-runtime

FROM node:22-bookworm-slim

ARG AGENT_UID=1001
ARG AGENT_GID=1001
ARG AGENT_CHILD_UID=1002
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
  && groupadd --gid "${AGENT_GID}" affiliate-agent \
  && useradd --uid "${AGENT_UID}" --gid "${AGENT_GID}" \
    --create-home --home-dir /home/affiliate-agent affiliate-agent \
  && useradd --uid "${AGENT_CHILD_UID}" --gid "${AGENT_GID}" \
    --create-home --home-dir /home/affiliate-agent-child affiliate-agent-child

COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
RUN mkdir -p \
    /var/lib/omp/.omp/profiles/affiliate-model-auth-broker \
    /var/lib/omp/.omp/profiles/affiliate-model-gateway \
  && chown -R 1003:1003 /var/lib/omp

WORKDIR /workspace/apps/site

COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY src ./src
COPY data ./data
COPY deploy/affiliate-governed/verify-runner-sandbox.mjs /usr/local/libexec/verify-runner-sandbox.mjs
COPY scripts/normalize-prisma-generated.mjs scripts/normalize-prisma-generated.mjs
COPY scripts/run-affiliate-agent-supervisor.ts scripts/run-affiliate-agent-supervisor.ts
COPY scripts/run-affiliate-agent-runner.ts scripts/run-affiliate-agent-runner.ts
COPY scripts/run-affiliate-omp-agent.ts scripts/run-affiliate-omp-agent.ts
COPY deploy/affiliate-governed/prepare-omp-service.sh /usr/local/bin/prepare-omp-service
COPY deploy/affiliate-governed/prepare-omp-bearers.mjs /usr/local/libexec/prepare-omp-bearers.mjs
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
  && printf '%s\n' \
  '#!/bin/sh' \
  'exec /usr/local/bin/bun /workspace/apps/site/scripts/run-affiliate-omp-agent.ts "$@"' \
  > /usr/local/bin/affiliate-omp-agent \
  && chmod 0555 /usr/local/bin/affiliate-agent-supervisor \
    /usr/local/bin/affiliate-agent-runner \
    /usr/local/bin/affiliate-omp-agent \
    /usr/local/bin/prepare-omp-service

ENV HOME=/tmp/affiliate-agent \
  PATH=/workspace/apps/site/node_modules/.bin:/usr/local/bin:/usr/bin:/bin \
  NODE_ENV=production

USER affiliate-agent
CMD ["/usr/local/bin/affiliate-agent-supervisor"]

