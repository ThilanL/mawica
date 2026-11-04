"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { heroArtwork } from "@/content/hero";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import { SnowCanvas } from "@/components/landing/SnowCanvas";
import type { SceneProps } from "../types";

/**
 * Snow globe scene. Pure presentation: receives plain props, knows nothing about
 * storage or publishing. Timeline lives in CSS (globals.css, .sg-*); tap-to-snow in JS.
 */
export function SnowGlobeScene({ recipientName, senderName, message, greeting, replayKey, compact = false }: SceneProps) {
  const art = heroArtwork;
  const reduced = usePrefersReducedMotion();
  const [burst, setBurst] = useState(false);

  // Auto snow burst while the village lights come on; restarts with replay.
  useEffect(() => {
    if (reduced) return;
    const on = setTimeout(() => setBurst(true), 3400);
    const off = setTimeout(() => setBurst(false), 6600);
    return () => { clearTimeout(on); clearTimeout(off); setBurst(false); };
  }, [reduced, replayKey]);

  const shake = () => {
    if (reduced) return;
    setBurst(true);
    setTimeout(() => setBurst(false), 3200);
  };

  return (
    <div
      key={replayKey}
      className="relative flex size-full flex-col items-center overflow-hidden bg-[radial-gradient(120%_80%_at_50%_20%,#5b3d8f,#2a1b3d_70%)] text-ivory"
     
    >
      <SnowCanvas count={28} speed={0.6} className="opacity-60" />

      {/* Beat 1: magical introduction */}
      <div aria-hidden className="sg-star pointer-events-none absolute left-1/2 top-[34%] -translate-x-1/2 text-gold drop-shadow-[0_0_28px_rgb(244_195_113/0.9)]">
        <svg viewBox="0 0 40 40" className="size-16"><path fill="currentColor" d="M20 0c1 11 3 16 9 17-6 1-8 6-9 23-1-17-3-22-9-23 6-1 8-6 9-17Z" /></svg>
      </div>
      <p aria-hidden className="sg-intro pointer-events-none absolute inset-x-0 top-[50%] px-8 text-center font-display text-3xl">
        A little magic for <span className="text-gold">{recipientName}</span>
      </p>

      {/* Beats 2 and 3: globe reveal, lights, snow burst. Sized from its own box so it never sits under the greeting. */}
      <div className="min-h-0 w-full flex-1 px-4 pt-14" style={{ containerType: "size" }}>
        <div className="sg-rise mx-auto grid size-full place-items-center">
          <button
            type="button"
            onClick={shake}
            disabled={reduced}
            aria-label="Shake the snow globe"
            className="relative block rounded-full disabled:cursor-default"
            style={{ aspectRatio: `${art.width} / ${art.height}`, width: `min(100cqw, 100cqh * ${art.width / art.height}, 26rem)` }}
          >
            <Image src={art.src} alt="" fill priority unoptimized={art.src.endsWith(".svg")} sizes="26rem" className="object-contain drop-shadow-[0_30px_40px_rgb(0_0_0/0.4)]" />
            <span aria-hidden className="absolute inset-0" style={{ clipPath: art.snowClip }}>
              <SnowCanvas count={burst ? 170 : 45} speed={burst ? 3 : 0.9} />
            </span>
            <span aria-hidden className="sg-lights absolute inset-0">
              {art.lights.map((l, i) => (
                <span
                  key={i}
                  className="light-glow absolute rounded-full"
                  style={{
                    left: `${l.x}%`, top: `${l.y}%`, width: `${l.size}%`, aspectRatio: "1", animationDelay: `${l.delay}s`, mixBlendMode: "screen",
                    background: `radial-gradient(closest-side, ${l.color === "gold" ? "rgb(244 195 113 / 0.9)" : "rgb(217 105 163 / 0.85)"}, transparent)`,
                  }}
                />
              ))}
            </span>
          </button>
        </div>
      </div>

      {/* Beats 4 and 5: personalised greeting, persists as readable text */}
      <section aria-label="Your greeting" className="relative z-10 mt-auto w-full px-6 pb-[max(2.75rem,env(safe-area-inset-bottom))] pt-2 text-center">
        <div className={`sg-t1 mx-auto max-w-md rounded-[1.75rem] bg-midnight/55 ${compact ? "p-4" : "p-6"} ring-1 ring-white/15 backdrop-blur-md`}>
          <p className="sg-t1 text-xs uppercase tracking-[0.22em] text-gold">For {recipientName}</p>
          <h2 className={`sg-t1 mt-1 font-display ${compact ? "text-2xl" : "text-4xl"} leading-tight`}>{greeting}</h2>
          <p className={`sg-t2 mt-3 overflow-y-auto whitespace-pre-line break-words leading-relaxed text-ivory/95 ${compact ? "max-h-24 text-sm" : "max-h-[26dvh] text-lg"}`}>{message}</p>
          <p className="sg-t3 mt-3 font-display text-lg text-gold">With love, {senderName}</p>
          {!reduced && <p className="sg-t4 mt-3 text-xs text-ivory/70">Tap the snow globe for a flurry of snow</p>}
        </div>
      </section>
    </div>
  );
}
