import { allowedOrigins } from "@/lib/auth";
import { hasSessionCookie, isAllowedOrigin } from "@/modules/auth/request";
import { getRequestUser } from "@/modules/auth/session";
import { deleteOwnPending, readMedia } from "@/modules/media/service";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Serves a photo. Authorised per request (owner, or anyone while the card is PUBLISHED), then sent with headers that stop the browser treating it as
 * anything but an image. `no-cache` + ETag: browsers must revalidate, so a removed card's photo disappears immediately, yet repeat views cost a 304.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = hasSessionCookie(request.headers.get("cookie")) ? await getRequestUser(request).catch(() => null) : null;
  const m = await readMedia(id, viewer);
  if (!m) return notFound();
  const etag = `"${m.sha256}"`;
  const headers: Record<string, string> = {
    "Cache-Control": m.public ? "public, no-cache" : "private, no-store",
    "Content-Type": m.contentType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
    "Cross-Origin-Resource-Policy": "same-origin",
    Vary: "Cookie",
  };
  if (m.public) {
    headers.ETag = etag;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  }
  headers["Content-Length"] = String(m.data.length);
  return new Response(new Uint8Array(m.data), { status: 200, headers });
}

/** The owner removes a photo that no card has claimed yet. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(request.headers, allowedOrigins)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const user = await getRequestUser(request).catch(() => null);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  return (await deleteOwnPending(user, id)) ? new Response(null, { status: 204 }) : notFound();
}
