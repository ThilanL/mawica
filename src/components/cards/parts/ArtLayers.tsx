import Image from "next/image";
import type { ReactNode } from "react";
import { sceneArtwork } from "@/content/artwork";
import type { TemplateKey } from "@/modules/templates/registry";

/** Full-bleed backdrop. Renders nothing until final artwork exists (the scene's gradient shows instead). */
export function SceneBackdrop({ k }: { k: TemplateKey }) {
  const l = sceneArtwork[k].backdrop;
  if (!l) return null;
  return <Image src={l.src} alt="" fill priority sizes="100vw" className="pointer-events-none object-cover" />;
}

/** Transparent overlay above the subject; never intercepts taps. Lazy so it cannot delay first paint. */
export function SceneForeground({ k }: { k: TemplateKey }) {
  const l = sceneArtwork[k].foreground;
  if (!l) return null;
  return <Image src={l.src} alt="" fill sizes="100vw" loading="lazy" className="pointer-events-none z-10 object-cover" />;
}

/**
 * The scene's main subject. Final artwork (transparent PNG/WebP) replaces the temporary SVG fallback;
 * code-driven lights are painted on top at the configured positions.
 */
export function ArtSlot({ k, children }: { k: TemplateKey; children: ReactNode }) {
  const art = sceneArtwork[k];
  if (!art.main) return <>{children}</>;
  return (
    <div className="relative size-full">
      <Image src={art.main.src} alt={art.main.alt} fill priority sizes="(min-width: 640px) 26rem, 90vw" className="object-contain" />
      {art.lights?.map((l, i) => (
        <span
          key={i}
          aria-hidden
          className="cc-glow absolute rounded-full"
          style={{
            left: `${l.x}%`, top: `${l.y}%`, width: `${l.size}%`, aspectRatio: "1", "--d": `${1.2 + l.delay * 2}s`, mixBlendMode: "screen",
            background: `radial-gradient(closest-side, ${l.color === "gold" ? "rgb(244 195 113 / 0.9)" : "rgb(217 105 163 / 0.85)"}, transparent)`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
