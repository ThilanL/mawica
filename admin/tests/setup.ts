// Admin tests use the isolated mawica_test database — never mawica_dev or remote.
try {
  process.loadEnvFile("../.env.local");
} catch {
  /* CI / explicit env */
}
try {
  process.loadEnvFile(".env.local");
} catch {
  /* optional admin override */
}

const testUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL (or DATABASE_URL) is required for admin tests");
if (!/\/mawica_test(\?|$)/.test(testUrl) || !testUrl.includes("5433")) {
  throw new Error("Admin tests must target local mawica_test on port 5433");
}
process.env.DATABASE_URL = testUrl;
process.env.TEST_DATABASE_URL = testUrl;
process.env.RATE_LIMIT_SALT ??= "test-rate-limit-salt-16chars";
process.env.ADMIN_APP_URL ??= "http://localhost:3010";
process.env.ADMIN_SESSION_SECRET ??= "test-admin-session-secret-32chars-minimum";
process.env.ADMIN_DEV_AUTH = "1";
process.env.ADMIN_DEV_STAFF_EMAIL ??= "dev.admin@mawica.local";
process.env.ADMIN_DEV_STAFF_OID ??= "local-dev-oid";
process.env.ADMIN_DEV_STAFF_ROLE ??= "OWNER";
process.env.ADMIN_STAFF_ALLOWLIST ??= "dev.admin@mawica.local:OWNER,readonly@mawica.local:READONLY";
process.env.NODE_ENV = "test";
