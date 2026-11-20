import { NextResponse } from "next/server";
import { requirePermission, StaffAuthzError } from "@/lib/authz";
import { readMarketingAssetFile } from "@mawica/modules/cms/marketing-media/read";
import { CmsMediaError } from "@mawica/modules/cms/marketing-media/validate";

type Ctx = { params: Promise<{ id: string }> };

/** Authenticated preview stream for the admin media library (does not use CardMedia). */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await requirePermission("cms:read");
    const { id } = await ctx.params;
    const variant = new URL(req.url).searchParams.get("variant") === "thumb" ? "thumb" : "full";
    const file = await readMarketingAssetFile(id, variant);
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.byteSize),
        ETag: file.etag,
        "Cache-Control": "private, max-age=60, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof StaffAuthzError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof CmsMediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
