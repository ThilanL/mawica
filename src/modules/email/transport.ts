import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export type OtpMail = { to: string; otp: string; purpose: "sign-in"; expiresInMinutes: number };

/** Where the local transport writes. Dev default only; production must opt in explicitly (and should not). */
export function localOutboxPath(): string | null {
  if (env.MAIL_LOCAL_OUTBOX) return path.resolve(env.MAIL_LOCAL_OUTBOX);
  return process.env.NODE_ENV === "production" ? null : path.resolve(".local-mail/outbox.jsonl");
}

/**
 * Mail boundary. Only a LOCAL transport exists in this stage: it appends to a gitignored file so tests can read
 * the code. Nothing is sent over the network and the code is never logged. With no transport available (production
 * without MAIL_LOCAL_OUTBOX) this throws, so sign-in fails closed instead of silently dropping codes.
 * A real provider (decision pending) will be added behind this same function.
 */
export async function sendOtpEmail(mail: OtpMail): Promise<void> {
  const file = localOutboxPath();
  if (!file) throw new Error("No mail transport is configured");
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify({ to: mail.to, otp: mail.otp, purpose: mail.purpose, expiresInMinutes: mail.expiresInMinutes, at: new Date().toISOString() }) + "\n", { mode: 0o600 });
}

/** Subject and plain-text body for the real provider later (kept here so copy is reviewed once). */
export function otpEmailContent(mail: Pick<OtpMail, "otp" | "expiresInMinutes">) {
  return {
    subject: `Your mawica. code: ${mail.otp}`,
    text: `Your mawica. sign-in code is ${mail.otp}.\n\nIt expires in ${mail.expiresInMinutes} minutes. If you did not ask for it, you can ignore this email; nobody can sign in without the code.\n`,
  };
}
