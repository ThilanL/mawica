import { NextResponse, type NextRequest } from "next/server";
import { getPublishedCard } from "@/modules/cards/service";

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Card not found | mawica.</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#FFF8F4;color:#2A1B3D;font-family:system-ui,sans-serif;text-align:center;padding:24px}h1{font-family:Georgia,serif;font-size:2.2rem;margin:0 0 12px}p{color:#5d4b73;margin:0 0 24px}a{display:inline-block;background:#2A1B3D;color:#FFF8F4;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600}</style></head><body><main><h1>This card isn&rsquo;t available</h1><p>The link may be mistyped, or the card may have been removed.</p><a href="/">Back to mawica.</a></main></body></html>`;

/**
 * Real HTTP 404 for unknown/removed cards. The card page streams under a
 * partially prerendered shell (status 200 is committed first), so existence is
 * checked here, before rendering. Uncached on purpose: removal takes effect instantly.
 */
export async function proxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.split("/")[2] ?? "";
  const card = await getPublishedCard(slug);
  if (!card) {
    return new NextResponse(NOT_FOUND_HTML, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }
  return NextResponse.next();
}

export const config = { matcher: "/c/:slug" };
