/**
 * Stripe secret scan (release gate A / E1). Prints only counts and file paths, never a matched value.
 *  1. Every git-tracked or untracked-but-not-ignored file (except .env* files) is scanned for Stripe secret patterns.
 *  2. The built client bundle (.next/static) is scanned for those patterns, for any NEXT_PUBLIC_STRIPE value, and for the exact
 *     values currently configured in .env.local (compared in memory only).
 *   node scripts/scan-stripe-secrets.mjs        (run after `npm run build` for step 2)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const PATTERN = /(sk|rk)_(test|live)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9+/=_-]{20,}/;
let failures = 0;

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).split("\0").filter(Boolean)
  // .env* files hold the secrets by design (git-ignored). Build output and dependencies are not source (the client bundle is checked below).
  .filter((f) => !/(^|\/)\.env/.test(f) && !/(^|\/)(node_modules|\.next)\//.test(f));
let scanned = 0;
for (const f of files) {
  let text;
  try { if (statSync(f).size > 5_000_000) continue; text = readFileSync(f, "utf8"); } catch { continue; }
  scanned++;
  if (PATTERN.test(text)) { console.log(`SECRET PATTERN IN SOURCE: ${f}`); failures++; }
}
console.log(`source: ${scanned} files scanned, ${failures} with Stripe secret patterns`);

const configured = [];
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^(STRIPE_[A-Z_]+|NEXT_PUBLIC_STRIPE[A-Z_]*)=(.*)$/);
    const v = m?.[2]?.trim().replace(/^["']|["']$/g, "");
    if (v && v.length >= 16) configured.push(v);
  }
} catch { /* no local env */ }

const staticDir = ".next/static";
if (!existsSync(staticDir)) { console.log("client bundle: .next/static not found (run npm run build first)"); process.exit(failures ? 1 : 0); }
const walk = (d, out = []) => {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
let bundleHits = 0; const bundle = walk(staticDir);
for (const f of bundle) {
  const text = readFileSync(f, "utf8");
  if (PATTERN.test(text) || /pk_(test|live)_[A-Za-z0-9]{20,}/.test(text) || configured.some((v) => text.includes(v))) { console.log(`STRIPE VALUE IN CLIENT BUNDLE: ${f}`); bundleHits++; }
}
console.log(`client bundle: ${bundle.length} files scanned, ${bundleHits} containing Stripe keys, secrets or configured values (${configured.length} configured values checked)`);
process.exit(failures || bundleHits ? 1 : 0);
