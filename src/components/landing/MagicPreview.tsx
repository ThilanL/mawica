"use client";

import { useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import { SnowCanvas } from "./SnowCanvas";

/**
 * A real, self-contained demo of the recipient experience (sample text only).
 * Plays once on mount; "Replay" restarts it. Reduced motion shows the final frame.
 */
export function MagicPreview() {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced || !root.current) return;
    const ctx = gsap.context(() => {
      tl.current = gsap
        .timeline({ defaults: { ease: "power2.out" } })
        .from("[data-s=card]", { scale: 0.9, opacity: 0, duration: 0.7 })
        .from("[data-s=star]", { scale: 0, rotate: -90, opacity: 0, duration: 0.8, ease: "back.out(2)" }, "-=0.2")
        .from("[data-s=to]", { y: 14, opacity: 0, duration: 0.6 }, "-=0.3")
        .from("[data-s=title]", { y: 18, opacity: 0, duration: 0.8 }, "-=0.2")
        .from("[data-s=msg]", { y: 14, opacity: 0, duration: 0.8 }, "-=0.3")
        .from("[data-s=from]", { y: 10, opacity: 0, duration: 0.6 }, "-=0.2");
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  const replay = useCallback(() => tl.current?.restart(), []);

  return (
    <div ref={root} className="flex flex-col items-center gap-5">
      <div data-s="card" className="relative aspect-[9/14] w-[min(70vw,17rem)] overflow-hidden rounded-[2rem] bg-[linear-gradient(170deg,#2a1b3d,#5b3d8f_65%,#9c7edb)] shadow-lift ring-1 ring-white/20">
        <SnowCanvas count={45} speed={0.8} />
        <div className="relative flex h-full flex-col items-center justify-center gap-3 px-7 text-center text-ivory">
          <svg data-s="star" aria-hidden viewBox="0 0 40 40" className="size-12 text-gold drop-shadow-[0_0_14px_rgb(244_195_113/0.8)]">
            <path fill="currentColor" d="M20 0c1 11 3 16 9 17-6 1-8 6-9 23-1-17-3-22-9-23 6-1 8-6 9-17Z" />
          </svg>
          <p data-s="to" className="text-sm tracking-[0.2em] text-ivory/80 uppercase">For Ava</p>
          <h3 data-s="title" className="font-display text-3xl leading-tight">Merry Christmas</h3>
          <p data-s="msg" className="text-sm leading-relaxed text-ivory/85">May your home glow with warmth and your days be full of little wonders.</p>
          <p data-s="from" className="mt-2 font-display text-lg text-gold">With love, Sam</p>
        </div>
      </div>
      <p className="text-center text-sm text-ink-soft">Sample card. Names and message are examples only.</p>
      {!reduced && (
        <button type="button" onClick={replay} className="rounded-full border border-midnight/20 px-5 py-2 text-sm font-semibold hover:bg-midnight/5">
          Replay
        </button>
      )}
    </div>
  );
}
