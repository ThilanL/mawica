import "server-only";
import { env } from "@/lib/env";
import { hit } from "@/modules/security/rate-limit";
import { createEmailService, type EmailService } from "./service";
import { authCodeEmail } from "./templates";
import type { SendOutcome } from "./types";

let service: EmailService | undefined;
/** Lazily built once per process. Config problems are logged once as codes (never values) and make sending fail closed. */
export function getEmailService(): EmailService {
  if (!service) {
    service = createEmailService({ ...env, NODE_ENV: process.env.NODE_ENV }, { limiter: hit, outboxMeta: () => ({ purpose: "auth-code" }) });
    for (const p of service.config.problems) console.error(JSON.stringify({ event: "email.config", problem: p }));
  }
  return service;
}

/** Sends the sign-in code. Never throws; callers must treat !ok as "no code was delivered". */
export async function sendAuthCode(to: string, otp: string, expiresInMinutes: number): Promise<SendOutcome> {
  return getEmailService().send("auth-code", authCodeEmail(to, otp, expiresInMinutes));
}

/** Boot-time check used by auth.ts: in production a missing/invalid provider is loud, but sign-in simply fails closed. */
export const emailConfigProblems = () => getEmailService().config.problems;
