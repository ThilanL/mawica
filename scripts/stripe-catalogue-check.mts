/**
 * READ-ONLY Stripe catalogue check (release gate E1). Compares the shared catalogue (src/modules/billing/catalogue.ts) with the
 * Prices that exist in the connected Stripe SANDBOX, by lookup key. It never creates, updates or deletes anything: it only lists
 * Prices (needs the restricted key's Prices: Read permission) and prints a value-free summary.
 *   npx tsx --conditions=react-server scripts/stripe-catalogue-check.mts
 */
import Stripe from "stripe";
import { CATALOGUE } from "../src/modules/billing/catalogue.ts";

try { process.loadEnvFile(".env.local"); } catch { /* CI provides env */ }
const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
if (!/^rk_test_[A-Za-z0-9]{16,}$/.test(key)) {
  console.error("Refusing: STRIPE_SECRET_KEY must be a restricted sandbox key (rk_test_). Live and full-access keys are never used.");
  process.exit(2);
}
const stripe = new Stripe(key, { apiVersion: "2026-11-18.endive", maxNetworkRetries: 1 });
const lookupKeys = CATALOGUE.map((e) => e.lookupKey);
const prices = await stripe.prices.list({ lookup_keys: lookupKeys, limit: 100, active: true });
if (prices.data.some((p) => p.livemode)) { console.error("Refusing: a live-mode price was returned"); process.exit(2); }

let drift = 0;
for (const entry of CATALOGUE) {
  const p = prices.data.find((x) => x.lookup_key === entry.lookupKey);
  if (!p) { console.log(`MISSING   ${entry.lookupKey}`); continue; }
  const expectedInterval = entry.interval ?? null;
  const ok = p.unit_amount === entry.amountCents && p.currency === entry.currency && (p.recurring?.interval ?? null) === expectedInterval;
  if (!ok) drift++;
  console.log(`${ok ? "MATCH    " : "DRIFT    "} ${entry.lookupKey}`);
}
console.log(`summary: ${CATALOGUE.length} catalogue entries, ${prices.data.length} matching sandbox prices found, ${drift} with drift. Nothing was created or changed.`);
process.exit(drift ? 1 : 0);
