import { hasSessionCookie } from "@/modules/auth/request";
import { getRequestUser } from "@/modules/auth/session";
import { db } from "@/lib/db";

const noStore = { "Cache-Control": "no-store" };

/** Tiny payload for the header: nothing sensitive, and anonymous visitors cost no database query. */
export async function GET(request: Request) {
  if (!hasSessionCookie(request.headers.get("cookie"))) return Response.json({ signedIn: false }, { headers: noStore });
  const user = await getRequestUser(request).catch(() => null);
  if (!user) return Response.json({ signedIn: false }, { headers: noStore });
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { displayName: true } });
  const source = profile?.displayName?.trim() || user.email;
  return Response.json({ signedIn: true, initial: Array.from(source)[0]?.toUpperCase() ?? "?" }, { headers: noStore });
}
