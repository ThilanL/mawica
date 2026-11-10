import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

export type SessionUser = { id: string; email: string; emailVerified: boolean };

/** Validates the session cookie against the database on the server. Use in server components/pages; deduplicated per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  return s?.user ? { id: s.user.id, email: s.user.email, emailVerified: s.user.emailVerified } : null;
});

/** Same check for route handlers, from the incoming request's own headers. */
export async function getRequestUser(request: Request): Promise<SessionUser | null> {
  const s = await auth.api.getSession({ headers: request.headers });
  return s?.user ? { id: s.user.id, email: s.user.email, emailVerified: s.user.emailVerified } : null;
}
