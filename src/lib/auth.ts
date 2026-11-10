import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { emailOTP } from "better-auth/plugins";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { recordAudit } from "@/modules/auth/audit";
import { CLIENT_IP_HEADER, parseOrigins } from "@/modules/auth/request";
import { sendOtpEmail } from "@/modules/email/transport";
import { ensureWallet } from "@/modules/wallet/wallet";

/**
 * Better Auth, pinned at 1.7.19 (compatibility proof: docs/accounts.md). Email one-time codes only: no passwords,
 * no OAuth in this stage. This module is imported only by the auth routes and account pages, never by the guest
 * card flow or the homepage.
 */
if (!env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required for accounts (at least 32 characters)");

export const authBaseUrl = env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_SITE_URL;
const base = new URL(authBaseUrl);
const secureCookies = base.protocol === "https:";
// Plain http is accepted for localhost only. Any real host must be https so session cookies get the Secure attribute.
if (!secureCookies && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("BETTER_AUTH_URL / NEXT_PUBLIC_SITE_URL must be https outside localhost");
}

export const allowedOrigins = parseOrigins(authBaseUrl, env.AUTH_TRUSTED_ORIGINS);
export const OTP_TTL_SECONDS = 300;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

const clientIpOf = (ctx: { request?: Request } | null) => ctx?.request?.headers.get(CLIENT_IP_HEADER) ?? null;

export const auth = betterAuth({
  appName: "Mawica",
  baseURL: authBaseUrl,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: allowedOrigins,
  telemetry: { enabled: false },
  logger: { level: "error" },
  database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
  session: { expiresIn: SESSION_TTL_SECONDS, updateAge: 60 * 60 * 24 },
  advanced: {
    cookiePrefix: "mawica",
    useSecureCookies: secureCookies,
    // Only ever the value our route wrapper derived with the app's trusted-proxy logic (it deletes client copies).
    ipAddressHeaders: [CLIENT_IP_HEADER],
    database: { generateId: "uuid" },
  },
  rateLimit: {
    enabled: true, // Better Auth defaults to production-only; we want it everywhere
    storage: "database",
    modelName: "authRateLimit", // never "rateLimit": that would collide with Mawica's own RateLimit table
    window: 60,
    max: 100,
    customRules: {
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user, ctx) => {
          try {
            await db.$transaction([
              db.profile.create({ data: { userId: user.id, termsAcceptedAt: new Date() } }),
              db.accountSettings.create({ data: { userId: user.id } }),
            ]);
          } catch {
            console.error("profile bootstrap failed"); // /account re-creates a missing profile on first visit
          }
          try {
            // Wallet + one-time welcome credit for a verified email. Idempotent, and also created lazily on first wallet use.
            await db.$transaction((tx) => ensureWallet(tx, { id: user.id, email: user.email, emailVerified: user.emailVerified }, new Date()));
          } catch {
            console.error("wallet bootstrap failed"); // generic on purpose; the wallet is created on first use instead
          }
          await recordAudit("auth.user_created", { userId: user.id, ip: clientIpOf(ctx) });
        },
      },
    },
    session: { create: { after: async (session, ctx) => { await recordAudit("auth.sign_in", { userId: session.userId, ip: clientIpOf(ctx) }); } } },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_TTL_SECONDS,
      allowedAttempts: 3,
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return; // the route wrapper only lets "sign-in" through; belt and braces
        await sendOtpEmail({ to: email, otp, purpose: "sign-in", expiresInMinutes: OTP_TTL_SECONDS / 60 });
      },
    }),
  ],
});
