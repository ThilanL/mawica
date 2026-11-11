// Validates the transactional-email settings in the CURRENT environment. Pure: no network, no database, no email is sent, secrets are never printed.
//   NODE_ENV=production DATABASE_URL=... EMAIL_PROVIDER=acs ACS_EMAIL_ENDPOINT=... npm run email:check
import { resolveEmailConfig } from "../src/modules/email/config";

const e = process.env;
const cfg = resolveEmailConfig({
  NODE_ENV: e.NODE_ENV, MAWICA_ENV: e.MAWICA_ENV, DATABASE_URL: e.DATABASE_URL ?? "",
  EMAIL_PROVIDER: e.EMAIL_PROVIDER as never, MAIL_LOCAL_OUTBOX: e.MAIL_LOCAL_OUTBOX,
  ACS_EMAIL_ENDPOINT: e.ACS_EMAIL_ENDPOINT, ACS_EMAIL_ACCESS_KEY: e.ACS_EMAIL_ACCESS_KEY, EMAIL_FROM_AUTH: e.EMAIL_FROM_AUTH,
  MAWICA_DISABLE_EXTERNAL_EMAIL: e.MAWICA_DISABLE_EXTERNAL_EMAIL,
});
console.log(`provider: ${cfg.provider}`);
if (cfg.provider === "acs") console.log(`endpoint host: ${new URL(cfg.endpoint).host}\nsender domain: ${cfg.from.split("@")[1]}\naccess key: present (${cfg.accessKey.length} chars, not shown)`);
for (const p of cfg.problems) console.log(`problem: ${p}`);
const ready = cfg.provider === "acs" || (cfg.provider === "local-outbox" && e.NODE_ENV !== "production");
console.log(ready ? "OK: sign-in codes can be sent with this configuration." : "NOT READY: sign-in codes would fail closed (generic 503) with this configuration.");
process.exitCode = ready ? 0 : 1;
