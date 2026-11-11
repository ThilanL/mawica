import { allowedOrigins } from "@/lib/auth";
import { isAllowedOrigin } from "@/modules/auth/request";
import { getRequestUser } from "@/modules/auth/session";
import { MEDIA_LIMITS } from "@/modules/media/limits";
import { uploadPhoto } from "@/modules/media/service";
import { MediaError } from "@/modules/media/validate";
import { clientIp } from "@/modules/security/client-hash";

const json = (b: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(b, { status, headers: { "Cache-Control": "no-store", ...extra } });

/** Reads at most `max` bytes. Aborts as soon as the limit is crossed, so an oversized or endless body never sits in memory. */
async function readCapped(request: Request, max: number): Promise<Buffer | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Photo upload for the signed-in owner. The body is the raw image (Content-Type image/jpeg|png|webp): no multipart parser, no filename, no
 * client-chosen path. Bytes are sniffed, decoded and re-encoded server-side; the stored copy is private to the owner until the card is published.
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request.headers, allowedOrigins)) return json({ error: "Forbidden" }, 403);
  const user = await getRequestUser(request).catch(() => null);
  if (!user) return json({ error: "Sign in to add a photo.", code: "SIGN_IN_REQUIRED" }, 401);
  const body = await readCapped(request, MEDIA_LIMITS.maxUploadBytes);
  if (!body) return json({ error: "That photo is too large. Choose one under 8 MB.", code: "TOO_LARGE" }, 413);
  try {
    const m = await uploadPhoto(user, { contentType: request.headers.get("content-type"), bytes: body, ip: clientIp(request.headers) });
    return json({ id: m.id, width: m.width, height: m.height, byteSize: m.byteSize }, 201);
  } catch (e) {
    if (e instanceof MediaError) return json({ error: e.message, code: e.code }, e.status, e.retryAfterSeconds ? { "Retry-After": String(e.retryAfterSeconds) } : {});
    console.error("media upload failed"); // generic: never the filename, user or content
    return json({ error: "We couldn't add that photo. Please try again." }, 500);
  }
}
