import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

async function logoDataUri() {
  const buf = await readFile(path.join(process.cwd(), "public/brand/mawica-wordmark.png"));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** Generic brand preview. Never includes a recipient name, sender or message. */
export async function brandOg(variant: "site" | "card") {
  const logo = await logoDataUri();
  const dark = variant === "card";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, background: dark ? "linear-gradient(160deg,#2A1B3D,#5b3d8f)" : "linear-gradient(160deg,#FFF8F4,#F7E6EF)", color: dark ? "#FFF8F4" : "#2A1B3D" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={640} height={213} style={{ borderRadius: 24, background: dark ? "#FFF8F4" : "transparent", padding: dark ? 16 : 0 }} />
        <div style={{ fontSize: 44, textAlign: "center", maxWidth: 900 }}>
          {dark ? "Someone made you a little magic." : "A little magic. A lot of love."}
        </div>
        <div style={{ fontSize: 28, opacity: 0.75 }}>{dark ? "Open your card" : "Create free Christmas & New Year cards"}</div>
      </div>
    ),
    OG_SIZE,
  );
}
