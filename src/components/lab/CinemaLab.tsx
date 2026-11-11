"use client";

import { useEffect, useState } from "react";
import { CinematicScene } from "@/components/cards/premium3d/CinematicScene";
import type { CardMedia } from "@/components/cards/types";

/** Draws a sample "photo" on a canvas (no asset, no upload) so the photo frame can be checked without an account. */
function samplePhoto(kind: string): Promise<CardMedia> {
  const [w, h] = kind === "tall" ? [600, 800] : kind === "wide" ? [960, 600] : [720, 720];
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#6aa7ff"); sky.addColorStop(0.55, "#ffd2a1"); sky.addColorStop(1, "#ff8fa3");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff6c9"; ctx.beginPath(); ctx.arc(w * 0.7, h * 0.32, h * 0.12, 0, 7); ctx.fill();
  ctx.fillStyle = "#3c2a5c"; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * 0.72); ctx.lineTo(w * 0.3, h * 0.55); ctx.lineTo(w * 0.55, h * 0.74); ctx.lineTo(w * 0.8, h * 0.6); ctx.lineTo(w, h * 0.75); ctx.lineTo(w, h); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = `bold ${h * 0.07}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("Sample photo", w / 2, h * 0.92);
  return new Promise((res) => c.toBlob((b) => res({ kind: "image", src: URL.createObjectURL(b!), width: w, height: h }), "image/jpeg", 0.85));
}

export function CinemaLab() {
  const [media, setMedia] = useState<CardMedia | null>(null);
  const [q, setQ] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQ(p); // eslint-disable-line react-hooks/set-state-in-effect -- read once on the client
    const photo = p.get("photo");
    if (photo) samplePhoto(photo === "1" ? "square" : photo).then(setMedia);
  }, []);
  if (!q) return null;
  return (
    <div className="h-dvh w-full" style={{ maxWidth: q.get("w") ? `${q.get("w")}px` : undefined }}>
      <CinematicScene
        recipientName={q.get("to") ?? "Nadia"}
        senderName={q.get("from") ?? "Sam"}
        message={q.get("msg") ?? "Lumi travelled a long way to bring you this wish: may your days be full of warmth, wonder and everything that makes you smile."}
        greeting="Lumi made a wish for you"
        replayKey={0}
        media={media}
      />
    </div>
  );
}
