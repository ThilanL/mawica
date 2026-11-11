import type { OutboundEmail } from "./types";

/** The code is in the body only, never the subject: subjects show in lock screens, logs and provider dashboards. */
export function authCodeEmail(to: string, otp: string, expiresInMinutes: number): OutboundEmail {
  return {
    to,
    subject: "Your mawica. sign-in code",
    text: `Your mawica. sign-in code is ${otp}.\n\nIt expires in ${expiresInMinutes} minutes. If you did not ask for it, you can ignore this email; nobody can sign in without the code.\n`,
  };
}
