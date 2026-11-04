import QRCode from "qrcode";
import { env } from "@/lib/env";
import { getPublishedCard } from "@/modules/cards/service";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const card = await getPublishedCard(slug);
  if (!card) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const png = await QRCode.toBuffer(`${env.NEXT_PUBLIC_SITE_URL}/c/${card.slug}`, {
    type: "png", width: 720, margin: 3, errorCorrectionLevel: "M", color: { dark: "#2A1B3D", light: "#FFFFFF" },
  });
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": `attachment; filename="mawica-card-${card.slug}.png"` } : {}),
    },
  });
}
