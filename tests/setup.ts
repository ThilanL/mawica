// Tests run against a dedicated test database on the isolated cluster, never mawica_dev: `mawica_test`, or a fresh, uniquely named
// `mawica_test_<suffix>` (lowercase letters, digits, underscores) for an isolated run. The cluster host/port guard (db-guard.ts) still applies.
// An explicitly exported TEST_DATABASE_URL wins over .env.local (process.loadEnvFile never overrides variables that are already set).
try { process.loadEnvFile(".env.local"); } catch { /* CI provides env */ }
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is required for tests");
if (!/\/mawica_test(_[a-z0-9_]+)?(\?|$)/.test(testUrl)) throw new Error("TEST_DATABASE_URL must point at mawica_test or mawica_test_<suffix>");
process.env.DATABASE_URL = testUrl;
process.env.TRUSTED_PROXY_HOPS = "1";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??= "vitest-only-secret-0123456789abcdef0123456789";
process.env.WELCOME_PEPPER ??= "vitest-only-pepper-0123456789abcdef0123456789ab";
