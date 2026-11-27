import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { describeStripeConfig, resolveStripeApiConfig, resolveStripeWebhookConfig } from "@/modules/billing/config";
import { PAYMENT_GATES, allPurchasingDisabled, isPaymentGateOpen } from "@/modules/billing/flags";
import { CATALOGUE } from "@/modules/billing/catalogue";
import { STRIPE_API_VERSION, getStripe } from "@/lib/stripe";

// Obviously fake values shaped like real keys. Never real credentials.
const FAKE = {
  rkTest: "rk_test_" + "A".repeat(24),
  skTest: "sk_test_" + "B".repeat(24),
  rkLive: "rk_live_" + "C".repeat(24),
  skLive: "sk_live_" + "D".repeat(24),
  pkTest: "pk_test_" + "E".repeat(24),
  whsec: "whsec_" + "F".repeat(32),
};

describe("Stripe API key guard (release gate E1)", () => {
  it("missing key disables Stripe without throwing", () => {
    expect(resolveStripeApiConfig({})).toEqual({ enabled: false, reason: "missing_secret_key" });
    expect(resolveStripeApiConfig({ STRIPE_SECRET_KEY: "   " })).toEqual({ enabled: false, reason: "missing_secret_key" });
  });
  it("accepts only a restricted sandbox key", () => {
    const c = resolveStripeApiConfig({ STRIPE_SECRET_KEY: FAKE.rkTest });
    expect(c.enabled).toBe(true);
    if (c.enabled) expect([c.keyKind, c.mode]).toEqual(["restricted", "test"]);
  });
  it("refuses full-access secret keys, test or live", () => {
    expect(resolveStripeApiConfig({ STRIPE_SECRET_KEY: FAKE.skTest })).toEqual({ enabled: false, reason: "full_access_key_refused" });
    expect(resolveStripeApiConfig({ STRIPE_SECRET_KEY: FAKE.skLive })).toEqual({ enabled: false, reason: "live_key_refused" });
  });
  it("refuses every live-mode key (accidental live configuration)", () => {
    for (const k of [FAKE.rkLive, FAKE.skLive, "pk_live_" + "G".repeat(24)]) expect(resolveStripeApiConfig({ STRIPE_SECRET_KEY: k })).toEqual({ enabled: false, reason: "live_key_refused" });
  });
  it("refuses a publishable key or garbage in the secret slot", () => {
    expect(resolveStripeApiConfig({ STRIPE_SECRET_KEY: FAKE.pkTest })).toEqual({ enabled: false, reason: "publishable_key_in_secret_slot" });
    for (const k of ["rk_test_short", "rk_test_" + "x".repeat(20) + "!", "not-a-key", FAKE.whsec]) expect(resolveStripeApiConfig({ STRIPE_SECRET_KEY: k }).enabled).toBe(false);
  });
  it("getStripe() returns null (payments unavailable) when the key is refused, and never throws", () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    try {
      for (const k of [undefined, FAKE.skTest, FAKE.rkLive]) {
        if (k === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = k;
        expect(getStripe()).toBeNull();
      }
      process.env.STRIPE_SECRET_KEY = FAKE.rkTest;
      expect(getStripe()).not.toBeNull(); // constructing the client makes no network call
    } finally {
      if (saved === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = saved;
    }
  });
  it("descriptions never contain the key or secret", () => {
    const d = JSON.stringify(describeStripeConfig({ STRIPE_SECRET_KEY: FAKE.rkTest, STRIPE_WEBHOOK_SECRET: FAKE.whsec }));
    expect(d).not.toContain(FAKE.rkTest);
    expect(d).not.toContain(FAKE.whsec);
    expect(JSON.stringify(describeStripeConfig({ STRIPE_SECRET_KEY: FAKE.skLive }))).not.toContain(FAKE.skLive);
  });
});

describe("Stripe webhook secret guard", () => {
  it("missing or malformed secret disables the webhook", () => {
    expect(resolveStripeWebhookConfig({})).toEqual({ enabled: false, reason: "missing_webhook_secret" });
    expect(resolveStripeWebhookConfig({ STRIPE_WEBHOOK_SECRET: FAKE.rkTest })).toEqual({ enabled: false, reason: "malformed_webhook_secret" });
    expect(resolveStripeWebhookConfig({ STRIPE_WEBHOOK_SECRET: "whsec_x" })).toEqual({ enabled: false, reason: "malformed_webhook_secret" });
    expect(resolveStripeWebhookConfig({ STRIPE_WEBHOOK_SECRET: FAKE.whsec }).enabled).toBe(true);
  });
});

describe("pinned API version", () => {
  it("matches the version the installed SDK was generated for", () => {
    expect(STRIPE_API_VERSION).toBe("2026-11-18.endive");
    expect(Stripe.API_VERSION).toBe(STRIPE_API_VERSION);
    expect(JSON.parse(readFileSync("package.json", "utf8")).dependencies.stripe).toBe("23.2.0"); // exact pin, no range
  });
});

describe("payment feature gates (all purchasing disabled in Phase 2)", () => {
  it("every gate is off", () => {
    expect(Object.values(PAYMENT_GATES).every((v) => v === false)).toBe(true);
    expect(allPurchasingDisabled()).toBe(true);
    for (const g of Object.keys(PAYMENT_GATES) as (keyof typeof PAYMENT_GATES)[]) expect(isPaymentGateOpen(g)).toBe(false);
  });
  it("cannot be switched on through the environment or at runtime", () => {
    for (const name of ["PAYMENTS_CHECKOUT", "PAYMENTS_SUBSCRIPTIONS", "PAYMENTS_PREMIUM", "PAYMENTS_LIVE", "PAYMENTS_UNLIMITED"]) process.env[name] = "1";
    expect(allPurchasingDisabled()).toBe(true);
    expect(() => { (PAYMENT_GATES as Record<string, boolean>).checkout = true; }).toThrow(); // frozen
    expect(isPaymentGateOpen("checkout")).toBe(false);
    for (const name of ["PAYMENTS_CHECKOUT", "PAYMENTS_SUBSCRIPTIONS", "PAYMENTS_PREMIUM", "PAYMENTS_LIVE", "PAYMENTS_UNLIMITED"]) delete process.env[name];
  });
  it("no catalogue product is purchasable", () => {
    expect(CATALOGUE.every((e) => e.purchasable === false)).toBe(true);
  });
  it("no page, layout or component imports pricing or billing code yet (no customer-facing price or purchase surface in E1)", () => {
    const ui = walk("src/app").concat(walk("src/components")).filter((f) => !f.startsWith(path.join("src", "app", "api", "stripe")));
    const offenders = ui.filter((f) => /@\/modules\/billing\/|@\/lib\/stripe|from\s+["']stripe["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === "generated" || name === "node_modules") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("secret exposure prevention (static)", () => {
  const files = walk("src");
  it("no client component imports Stripe, billing configuration or webhook code", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      if (!/^\s*["']use client["']/m.test(src)) return false;
      return /from\s+["'](stripe|@\/lib\/stripe|@\/modules\/billing\/(config|ownership|webhook\/[^"']+))["']/.test(src);
    });
    expect(offenders).toEqual([]);
  });
  it("every module that can see a Stripe secret is server-only", () => {
    for (const f of ["src/lib/stripe.ts", "src/modules/billing/config.ts", "src/modules/billing/ownership.ts", "src/modules/billing/webhook/verify.ts", "src/modules/billing/webhook/process.ts", "src/modules/billing/webhook/handlers.ts", "src/modules/billing/webhook/log.ts"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/^import "server-only";/m);
    }
  });
  it("no source file contains anything shaped like a real Stripe secret, and no NEXT_PUBLIC_ Stripe variable is read", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(/(sk|rk)_(test|live)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}/.test(src), f).toBe(false);
      expect(src.includes("NEXT_PUBLIC_STRIPE"), f).toBe(false);
    }
  });
});
