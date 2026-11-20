// Custom-domain template safety (infra/staging/app.json + web_params.py). Nothing here talks to Azure.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const ENV_ID = "/subscriptions/d5b6244c-44ac-49fb-9e93-a628acfea802/resourceGroups/rg-mawica-staging-aue/providers/Microsoft.App/managedEnvironments/cae-mawica-stg";
const AZ = "https://ca-mawica-stg.lemonmushroom-f91c9fdb.australiaeast.azurecontainerapps.io";
const CERT = `${ENV_ID}/managedCertificates/mc-cae-mawica-stg-staging-mawica-1234`;

type Live = { exists: boolean; customDomains?: { name: string; certificateId?: string; bindingType?: string }[] | null; env?: Record<string, string | null> };
let SECRETS: string[] = [];
const EMAIL_OFF = { emailProvider: "none", emailFromAuth: "", emailAllowlistRequired: "1", disableExternalEmail: "1" };
const decide = (live: Live, request: Record<string, string> = {}) => {
  const r = spawnSync("python3", ["-I", join("infra/staging/web_params.py")], {
    input: JSON.stringify({ envId: ENV_ID, azureDefaultUrl: AZ, live, request, secrets: SECRETS }), encoding: "utf8", cwd: ROOT,
  });
  return { status: r.status, out: r.status === 0 ? JSON.parse(r.stdout) : null, err: r.stderr };
};
function join(p: string) { return resolve(ROOT, p); }
const LIVE_TODAY: Live = { exists: true, customDomains: null, env: { NEXT_PUBLIC_SITE_URL: AZ, AUTH_TRUSTED_ORIGINS: null } };
const LIVE_BOUND: Live = { exists: true, customDomains: [{ name: "staging.mawica.com", certificateId: CERT, bindingType: "SniEnabled" }], env: { NEXT_PUBLIC_SITE_URL: "https://staging.mawica.com", AUTH_TRUSTED_ORIGINS: AZ } };

describe("web_params.py: what a full deployment passes", () => {
  it("default Azure-hostname deployment: every parameter empty, so the template stays identical", () => {
    expect(decide(LIVE_TODAY).out).toEqual({ siteUrl: "", authTrustedOrigins: "", customDomainName: "", customDomainCertificateId: "", ...EMAIL_OFF });
    expect(decide({ exists: false }).out).toEqual({ siteUrl: "", authTrustedOrigins: "", customDomainName: "", customDomainCertificateId: "", ...EMAIL_OFF });
  });

  it("carries a live custom domain, its managed certificate, site URL and trusted origins forward", () => {
    expect(decide(LIVE_BOUND).out).toEqual({ siteUrl: "https://staging.mawica.com", authTrustedOrigins: AZ, customDomainName: "staging.mawica.com", customDomainCertificateId: CERT, ...EMAIL_OFF });
  });

  it("binds a new custom domain with an SNI certificate of this environment", () => {
    const r = decide(LIVE_TODAY, { CUSTOM_DOMAIN: "staging.mawica.com", CUSTOM_DOMAIN_CERT_ID: CERT, SITE_URL: "https://staging.mawica.com", AUTH_TRUSTED_ORIGINS: AZ });
    expect(r.out).toEqual({ siteUrl: "https://staging.mawica.com", authTrustedOrigins: AZ, customDomainName: "staging.mawica.com", customDomainCertificateId: CERT, ...EMAIL_OFF });
  });

  it("rejects a certificate from another environment, subscription or resource type", () => {
    for (const bad of [
      CERT.replace("cae-mawica-stg", "cae-other"),
      CERT.replace("d5b6244c-44ac-49fb-9e93-a628acfea802", "00000000-0000-0000-0000-000000000000"),
      `${ENV_ID}/storageAccounts/x`, "not-an-id", `${CERT}/../x`,
    ]) expect(decide(LIVE_TODAY, { CUSTOM_DOMAIN: "staging.mawica.com", CUSTOM_DOMAIN_CERT_ID: bad }).status).toBe(1);
    expect(decide(LIVE_TODAY, { CUSTOM_DOMAIN: "staging.mawica.com" }).err).toMatch(/no certificate/);
  });

  it("never silently removes or replaces a live custom domain", () => {
    const r = decide(LIVE_BOUND, { CUSTOM_DOMAIN: "other.mawica.com", CUSTOM_DOMAIN_CERT_ID: CERT });
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/would be removed/);
    expect(decide(LIVE_BOUND, { CUSTOM_DOMAIN: "other.mawica.com", CUSTOM_DOMAIN_CERT_ID: CERT, REPLACE_DOMAIN: "yes" }).out.customDomainName).toBe("other.mawica.com");
    expect(decide({ ...LIVE_BOUND, customDomains: [...LIVE_BOUND.customDomains!, { name: "b.mawica.com", certificateId: CERT }] }).status).toBe(1);
    expect(decide({ ...LIVE_BOUND, customDomains: [{ ...LIVE_BOUND.customDomains![0], bindingType: "Disabled" }] }).status).toBe(1);
  });

  it("re-naming the live domain reuses its certificate; a new certificate for it is accepted", () => {
    expect(decide(LIVE_BOUND, { CUSTOM_DOMAIN: "staging.mawica.com" }).out.customDomainCertificateId).toBe(CERT);
    const renewed = `${ENV_ID}/managedCertificates/mc-new`;
    expect(decide(LIVE_BOUND, { CUSTOM_DOMAIN: "staging.mawica.com", CUSTOM_DOMAIN_CERT_ID: renewed }).out.customDomainCertificateId).toBe(renewed);
  });

  it("site URL must be a bare https origin", () => {
    for (const bad of ["http://staging.mawica.com", "https://staging.mawica.com/path", "staging.mawica.com", "https://*.mawica.com", "javascript:alert(1)"])
      expect(decide(LIVE_TODAY, { SITE_URL: bad }).status).toBe(1);
    expect(decide(LIVE_TODAY, { SITE_URL: "https://staging.mawica.com/" }).out.siteUrl).toBe("https://staging.mawica.com");
    expect(decide(LIVE_TODAY, { SITE_URL: AZ }).out.siteUrl).toBe(""); // the default stays the template default
  });

  it("trusted origins: no wildcard, no http, no paths; 'none' clears; the site itself is not duplicated", () => {
    for (const bad of ["*", "https://*", "http://evil.example", "https://a.example/x", "https://a.example, *", "null"])
      expect(decide(LIVE_TODAY, { AUTH_TRUSTED_ORIGINS: bad }).status).toBe(1);
    expect(decide(LIVE_BOUND, { AUTH_TRUSTED_ORIGINS: "none" }).out.authTrustedOrigins).toBe("");
    expect(decide(LIVE_TODAY, { AUTH_TRUSTED_ORIGINS: `${AZ},${AZ}` }).out.authTrustedOrigins).toBe("");
    expect(decide(LIVE_BOUND, { AUTH_TRUSTED_ORIGINS: `${AZ}, https://preview.mawica.com` }).out.authTrustedOrigins).toBe(`${AZ},https://preview.mawica.com`);
  });

  it("email: carried forward; resend needs a sender, both Key Vault secrets and the allowlist flag", () => {
    const LIVE_RESEND: Live = { ...LIVE_TODAY, env: { ...LIVE_TODAY.env, EMAIL_PROVIDER: "resend", EMAIL_FROM_AUTH: "no-reply@mail.mawica.com", MAWICA_DISABLE_EXTERNAL_EMAIL: "0", MAWICA_EMAIL_ALLOWLIST_REQUIRED: "1" } };
    SECRETS = ["resend-api-key", "email-recipient-allowlist"];
    expect(decide(LIVE_RESEND).out).toMatchObject({ emailProvider: "resend", emailFromAuth: "no-reply@mail.mawica.com", disableExternalEmail: "0", emailAllowlistRequired: "1" });
    expect(decide(LIVE_RESEND, { MAWICA_DISABLE_EXTERNAL_EMAIL: "1" }).out.disableExternalEmail).toBe("1"); // kill switch always allowed
    expect(decide(LIVE_RESEND, { MAWICA_EMAIL_ALLOWLIST_REQUIRED: "0" }).status).toBe(1);
    expect(decide(LIVE_TODAY, { EMAIL_PROVIDER: "resend", EMAIL_FROM_AUTH: "Mawica <x@mail.mawica.com>" }).status).toBe(1);
    expect(decide(LIVE_TODAY, { EMAIL_PROVIDER: "acs" }).status).toBe(1);
    expect(decide(LIVE_TODAY, { MAWICA_DISABLE_EXTERNAL_EMAIL: "0" }).status).toBe(1); // no provider: switch stays 1
    SECRETS = ["resend-api-key"];
    expect(decide(LIVE_TODAY, { EMAIL_PROVIDER: "resend", EMAIL_FROM_AUTH: "no-reply@mail.mawica.com" }).err).toMatch(/email-recipient-allowlist/);
    SECRETS = [];
  });

  it("fails closed on an unreadable live state", () => {
    const r = spawnSync("python3", ["-I", join("infra/staging/web_params.py")], { input: "{not json", encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

describe("app.json: custom-domain support without changing the running app", () => {
  const t = JSON.parse(readFileSync(join("infra/staging/app.json"), "utf8"));
  const web = t.resources.find((r: { name?: string }) => r.name === "[variables('appName')]");
  const c = web.properties.template.containers[0];
  const conf = web.properties.configuration;

  it("new parameters default to the current behaviour", () => {
    for (const p of ["siteUrl", "authTrustedOrigins", "customDomainName", "customDomainCertificateId"]) expect(t.parameters[p]).toMatchObject({ type: "string", defaultValue: "" });
    expect(JSON.stringify(t)).not.toMatch(/managedCertificates\/mc-|"certificateId": "\/subscriptions/); // no hard-coded certificate
  });

  it("ingress keeps HTTPS-only, port 8080, external; customDomains only when a domain is set (SNI + certificate)", () => {
    expect(conf.ingress).toBe("[union(createObject('external', true(), 'targetPort', 8080, 'transport', 'auto', 'allowInsecure', false()), if(empty(parameters('customDomainName')), createObject(), createObject('customDomains', variables('customDomains'))))]");
    expect(t.variables.customDomains).toContain("'bindingType', 'SniEnabled', 'certificateId', parameters('customDomainCertificateId')");
  });

  it("NEXT_PUBLIC_SITE_URL and BETTER_AUTH_URL both use siteUrl, defaulting to the Azure hostname; outputs agree", () => {
    const url = "if(empty(parameters('siteUrl')), concat('https://', variables('appName'), '.', reference(resourceId('Microsoft.App/managedEnvironments', variables('envName')), '2024-03-01').defaultDomain), parameters('siteUrl'))";
    expect(c.env).toContain(`createObject('name', 'NEXT_PUBLIC_SITE_URL', 'value', ${url})`);
    expect(c.env).toContain(`createObject('name', 'BETTER_AUTH_URL', 'value', ${url})`);
    expect(t.outputs.appUrl.value).toBe(`[${url}]`);
  });

  it("AUTH_TRUSTED_ORIGINS is only added when set (empty adds nothing)", () => {
    expect(c.env).toContain("if(empty(parameters('authTrustedOrigins')), createArray(), createArray(createObject('name', 'AUTH_TRUSTED_ORIGINS', 'value', parameters('authTrustedOrigins'))))");
  });

  it("environment variables, Key Vault references and database settings are unchanged", () => {
    const names = [...c.env.matchAll(/createObject\('name', '([A-Z_]+)'/g)].map((m: RegExpMatchArray) => m[1]);
    expect(names).toEqual(["NODE_ENV", "HOSTNAME", "PORT", "DATABASE_URL", "DATABASE_POOL_MAX", "BETTER_AUTH_SECRET", "WELCOME_PEPPER", "RATE_LIMIT_SALT", "NEXT_PUBLIC_SITE_URL", "BETTER_AUTH_URL", "TRUSTED_PROXY_HOPS", "EMAIL_PROVIDER", "MAWICA_DISABLE_EXTERNAL_EMAIL", "EMAIL_DELIVERY_ENABLED", "EMAIL_FROM_AUTH", "MAWICA_EMAIL_ALLOWLIST_REQUIRED", "RESEND_API_KEY", "EMAIL_RECIPIENT_ALLOWLIST", "AUTH_TRUSTED_ORIGINS"]);
    for (const s of ["'DATABASE_URL', 'secretRef', 'database-app-url'", "'BETTER_AUTH_SECRET', 'secretRef', 'better-auth-secret'", "'WELCOME_PEPPER', 'secretRef', 'welcome-pepper'", "'RATE_LIMIT_SALT', 'secretRef', 'rate-limit-salt'", "'DATABASE_POOL_MAX', 'value', '5'", "'EMAIL_PROVIDER', 'value', parameters('emailProvider')", "'MAWICA_DISABLE_EXTERNAL_EMAIL', 'value', parameters('disableExternalEmail')", "'EMAIL_DELIVERY_ENABLED', 'value', '0'", "'TRUSTED_PROXY_HOPS', 'value', '1'"])
      expect(c.env).toContain(s);
    // Resend env/secret references only exist when emailProvider=resend; defaults keep email off exactly as before.
    expect(c.env).toContain("if(equals(parameters('emailProvider'), 'resend'), createArray(createObject('name', 'EMAIL_FROM_AUTH'");
    expect(t.parameters.emailProvider).toMatchObject({ defaultValue: "none", allowedValues: ["none", "resend"] });
    expect(t.parameters.disableExternalEmail).toMatchObject({ defaultValue: "1" });
    expect(t.parameters.emailAllowlistRequired).toMatchObject({ defaultValue: "1" });
    for (const n of ["database-app-url", "better-auth-secret", "welcome-pepper", "rate-limit-salt"]) expect(conf.secrets).toContain(`createObject('name', '${n}'`);
    expect(conf.secrets).toContain("if(equals(parameters('emailProvider'), 'resend'), createArray(createObject('name', 'resend-api-key'");
    expect(conf.secrets.match(/'identity', variables\('appId'\)/g).length).toBe(6); // every web secret is read by the web identity only
  });

  it("identity, registry, scaling, probes and resources are unchanged", () => {
    expect(Object.keys(web.identity.userAssignedIdentities)).toEqual(["[variables('appId')]"]);
    expect(conf.registries).toEqual([{ server: "[variables('acrServer')]", identity: "[variables('appId')]" }]);
    expect(web.properties.template.scale).toMatchObject({ minReplicas: 0, maxReplicas: 1 });
    expect(c.resources).toEqual({ cpu: 0.5, memory: "1Gi" });
    expect(c.probes.map((p: { type: string; httpGet: { path: string } }) => `${p.type}:${p.httpGet.path}`)).toEqual(["Startup:/api/health", "Readiness:/api/health", "Liveness:/api/health"]);
    const grants = t.resources.filter((r: { type: string }) => r.type === "Microsoft.Authorization/roleAssignments").length;
    expect(grants).toBe(6); // 2 AcrPull + secretGrants loop + env join + migrate job + web app (unchanged count)
    expect(t.variables.secretGrants.filter((g: { identity: string }) => g.identity === "id-mawica-stg-app").map((g: { secret: string }) => g.secret)).toEqual(["database-app-url", "better-auth-secret", "welcome-pepper", "rate-limit-salt", "resend-api-key", "email-recipient-allowlist"]);
  });
});
