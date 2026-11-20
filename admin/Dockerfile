# Mawica Admin image for Azure Container Apps (build-only in R1 — no deploy).
# Build from the monorepo root so the shared Prisma client and @mawica modules resolve:
#   docker build -f admin/Dockerfile -t mawica-admin:local .
# No secrets are baked in. Runtime values come from Container Apps / Key Vault env.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma generate needs OpenSSL + CA store (same as consumer image).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Root install → prisma generate (admin imports src/generated/prisma + shared modules).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY src/lib/db-guard.ts ./src/lib/db-guard.ts
RUN npm ci --no-audit --no-fund

# Separate admin package lock (own Next standalone graph).
COPY admin/package.json admin/package-lock.json ./admin/
RUN npm ci --prefix admin --no-audit --no-fund

FROM deps AS build
COPY . .
WORKDIR /app/admin
# Placeholders only for `next build` (import-time env validation). Not present in the runner image config.
# MAWICA_ADMIN_IMAGE_BUILD skips production Entra hard-requirements during the image build.
ENV NODE_ENV=production MAWICA_ADMIN_IMAGE_BUILD=1
# Explicitly clear any accidental local-dev flags; secrets are placeholders for collect-page-data only.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5433/build" \
    RATE_LIMIT_SALT="build-time-placeholder-only" \
    ADMIN_SESSION_SECRET="build-time-placeholder-not-a-secret-000000" \
    ADMIN_APP_URL="https://admin.build.invalid" \
    ADMIN_DEV_AUTH=0 \
    npm run build \
 && mkdir -p .next/standalone/admin/.next/static \
 && cp -r .next/static/. .next/standalone/admin/.next/static/

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=8080
# outputFileTracingRoot is the monorepo parent → standalone layout is admin/server.js under the trace root.
COPY --from=build --chown=node:node /app/admin/.next/standalone ./
USER node
EXPOSE 8080
CMD ["node", "admin/server.js"]
