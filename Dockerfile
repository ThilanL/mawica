# Mawica container image for Azure Container Apps (staging). Built on Linux x64 in CI so native modules (sharp/libvips, Prisma) match the runtime.
#   docker build --build-arg NEXT_PUBLIC_SITE_URL=https://<staging host> -t mawica-web .                 # web (target: runner)
#   docker build --target migrate -t mawica-migrate .                                                    # one-off migration job
# No secrets are baked in: runtime values come from Container Apps secrets (Key Vault references) and env vars.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma's migration engine needs OpenSSL, and verifies the database certificate against the system CA store (the slim image ships neither).
# The web runtime does not need them: node-postgres verifies with Node's bundled CA list (checked against the Azure server: trusted, TLS 1.3).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY src/lib/db-guard.ts ./src/lib/db-guard.ts
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# NEXT_PUBLIC_SITE_URL is inlined into pages at build time, so each environment gets its own build.
ARG NEXT_PUBLIC_SITE_URL
# 1 = staging/preview build: X-Robots-Tag noindex, robots.txt disallows all, empty sitemap. Unset for production.
ARG MAWICA_NOINDEX=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NODE_ENV=production
# Build-time placeholders only, scoped to this RUN (not ARG/ENV, so not in the image config or later layers). `next build` imports the
# route modules to collect page data, and src/lib/auth.ts requires BETTER_AUTH_SECRET at import; nothing connects or signs during the
# build. Real values come from Azure Key Vault at runtime. Same shape as the CI dummies (.github/workflows/ci.yml).
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5433/build" RATE_LIMIT_SALT="build-time-placeholder-only" \
    BETTER_AUTH_SECRET="build-time-placeholder-not-a-secret-000000" WELCOME_PEPPER="build-time-placeholder-not-a-pepper-000000" \
    MAWICA_NOINDEX="$MAWICA_NOINDEX" npm run build \
 && mkdir -p .next/standalone/.next/static && cp -r .next/static/. .next/standalone/.next/static/ \
 && mkdir -p .next/standalone/public && cp -r public/. .next/standalone/public/

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=8080
COPY --from=build --chown=node:node /app/.next/standalone ./
USER node
EXPOSE 8080
CMD ["node", "server.js"]

# Prisma migrations, run as a manually triggered Container Apps job inside the VNet (the database has no public endpoint).
FROM deps AS migrate
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]
