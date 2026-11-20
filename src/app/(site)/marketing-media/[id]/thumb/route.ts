import { NextResponse } from "next/server";
import { marketingDeliveryHeaders, readMarketingAssetFile } from "@/modules/cms/marketing-media/read";
import { CmsMediaError } from "@/modules/cms/marketing-media/validate";

export const instant = false;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const file = await readMarketingAssetFile(id, "thumb");
    const out = marketingDeliveryHeaders(file, req);
    if (out.status === 304) return new NextResponse(null, { status: 304, headers: out.headers });
    return new NextResponse(new Uint8Array(out.body!), { status: 200, headers: out.headers });
  } catch (e) {
    if (e instanceof CmsMediaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
