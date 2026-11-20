/**
 * Pure production configuration checks (no process.env side effects).
 * Used by env bootstrap and unit tests.
 */

export type AdminEnvLike = {
  NODE_ENV: "development" | "test" | "production";
  ADMIN_APP_URL: string;
  ADMIN_DEV_AUTH?: "0" | "1";
  ADMIN_ENTRA_TENANT_ID?: string;
  ADMIN_ENTRA_CLIENT_ID?: string;
  ADMIN_ENTRA_CLIENT_SECRET?: string;
  ADMIN_ENTRA_REDIRECT_URI?: string;
  ADMIN_STAFF_ALLOWLIST?: string;
  ADMIN_TRUSTED_ORIGINS?: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isAdminImageBuildPhase(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NEXT_PHASE === "phase-production-build" ||
    env.MAWICA_ADMIN_IMAGE_BUILD === "1"
  );
}

export function entraFullyConfigured(data: AdminEnvLike): boolean {
  return Boolean(
    data.ADMIN_ENTRA_TENANT_ID &&
      data.ADMIN_ENTRA_CLIENT_ID &&
      data.ADMIN_ENTRA_CLIENT_SECRET &&
      data.ADMIN_ENTRA_REDIRECT_URI,
  );
}

/** Dev auth is never permitted when NODE_ENV=production (including mis-set ADMIN_DEV_AUTH=1). */
export function assertDevAuthNotInProduction(
  data: AdminEnvLike,
  opts?: { isBuildPhase?: boolean },
): void {
  // Image/`next build` may see a developer .env.local; runtime still hard-fails.
  if (opts?.isBuildPhase ?? isAdminImageBuildPhase()) return;
  if (data.NODE_ENV === "production" && data.ADMIN_DEV_AUTH === "1") {
    throw new Error("ADMIN_DEV_AUTH cannot be enabled when NODE_ENV=production");
  }
}

/**
 * Runtime production hard requirements for Azure Container Apps.
 * Skipped during `next build` / image build (placeholders only).
 */
export function assertProductionRuntimeConfig(
  data: AdminEnvLike,
  opts?: { isBuildPhase?: boolean },
): void {
  const buildPhase = opts?.isBuildPhase ?? isAdminImageBuildPhase();
  assertDevAuthNotInProduction(data, { isBuildPhase: buildPhase });
  if (data.NODE_ENV !== "production") return;
  if (buildPhase) return;

  let appUrl: URL;
  try {
    appUrl = new URL(data.ADMIN_APP_URL);
  } catch {
    throw new Error("ADMIN_APP_URL is not a valid URL");
  }

  if (appUrl.protocol !== "https:" && !LOCAL_HOSTS.has(appUrl.hostname)) {
    throw new Error("ADMIN_APP_URL must use https in production (outside localhost)");
  }

  if (!entraFullyConfigured(data)) {
    throw new Error(
      "Production requires ADMIN_ENTRA_TENANT_ID, CLIENT_ID, CLIENT_SECRET, and REDIRECT_URI",
    );
  }

  if (!data.ADMIN_STAFF_ALLOWLIST?.trim()) {
    throw new Error("ADMIN_STAFF_ALLOWLIST is required in production");
  }

  let redirect: URL;
  try {
    redirect = new URL(data.ADMIN_ENTRA_REDIRECT_URI!);
  } catch {
    throw new Error("ADMIN_ENTRA_REDIRECT_URI is not a valid URL");
  }

  if (redirect.origin !== appUrl.origin) {
    throw new Error("ADMIN_ENTRA_REDIRECT_URI origin must match ADMIN_APP_URL origin");
  }
  if (redirect.pathname !== "/api/auth/callback") {
    throw new Error('ADMIN_ENTRA_REDIRECT_URI path must be "/api/auth/callback"');
  }

  // Optional extras must be absolute https (or localhost) origins — never host headers.
  for (const raw of (data.ADMIN_TRUSTED_ORIGINS ?? "").split(",")) {
    const s = raw.trim();
    if (!s) continue;
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      throw new Error(`ADMIN_TRUSTED_ORIGINS entry is not a valid URL: ${s}`);
    }
    if (u.protocol !== "https:" && !LOCAL_HOSTS.has(u.hostname)) {
      throw new Error(`ADMIN_TRUSTED_ORIGINS entries must be https outside localhost: ${s}`);
    }
  }
}
