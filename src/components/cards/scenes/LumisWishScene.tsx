"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { GreetingPanel } from "../parts/GreetingPanel";
import { ArtStage } from "../parts/ArtStage";
import { ParticleBurst, type BurstHandle } from "../parts/ParticleBurst";
import { useSchedule } from "../parts/useSchedule";
import type { SceneProps } from "../types";

/**
 * Lumi's Wish (premium). Pure CSS + two small WebP stills of the approved Lumi character (asleep / awake, rendered from the
 * same model as the homepage Lumi) + one 2D particle canvas that only runs while a burst is alive. No WebGL, no Three.js,
 * no extra dependency: recipients on any phone get it from one small lazy chunk.
 *
 * Timeline (seconds): 0 glowing orb -> 1.0 Lumi appears asleep -> 2.6 wakes (hop) -> 3.8 notices the recipient ->
 * 4.2 golden motes gather -> 5.4 name revealed -> 6.4 personal message -> 8.8 Lumi celebrates -> 10.2 final wish.
 * The default style of every element is the finished card; reduced motion and no-JS show it complete and readable at once.
 */
const T = { orb: 0, rise: 1.0, wake: 2.6, notice: 3.8, gather: 4.2, name: 5.4, panel: 6.4, celebrate: 8.8, wish: 10.2 };
const d = (s: number) => ({ "--d": `${s}s` }) as React.CSSProperties;

// Fixed star-field (static dots; they only twinkle when motion is allowed).
const STARS: [number, number, number, number][] = [[8, 12, 2, 0.2], [22, 6, 1.5, 1.1], [37, 16, 2, 2], [61, 8, 1.5, 0.7], [78, 14, 2.5, 1.6], [91, 7, 1.5, 2.4], [14, 34, 1.5, 0.4], [88, 38, 2, 1.9], [5, 58, 2, 2.2], [95, 62, 1.5, 0.9], [30, 80, 1.5, 1.4], [70, 84, 2, 0.3]];
const MOTES = Array.from({ length: 12 }, (_, i) => ({ a: i * 30 + (i % 2 ? 9 : 0), r: 34 + (i % 3) * 8, s: 5 + (i % 4) * 1.5, delay: (i % 4) * 0.12 }));
const WISHES: [string, number, number][] = [["joy", 12, 0], ["love", 78, 1.6], ["wonder", 22, 3.1], ["hope", 70, 4.4], ["magic", 46, 2.2]];

export function LumisWishScene({ recipientName, senderName, message, greeting, replayKey, compact = false }: SceneProps) {
  const fx = useRef<BurstHandle>(null);
  const [wiggle, setWiggle] = useState(0);

  useSchedule(replayKey, [
    [T.wake * 1000, () => fx.current?.burst("sparks", 0.5, 0.48)],
    [(T.gather + 0.2) * 1000, () => fx.current?.burst("sparks", 0.5, 0.5)],
    [(T.gather + 0.7) * 1000, () => fx.current?.burst("sparks", 0.46, 0.52)],
    [T.name * 1000, () => fx.current?.burst("sparks", 0.5, 0.2)],
    [T.celebrate * 1000, () => { fx.current?.burst("confetti"); fx.current?.burst("sparks", 0.5, 0.5); }],
    [(T.celebrate + 0.35) * 1000, () => fx.current?.burst("sparks", 0.4, 0.45)],
    [T.wish * 1000, () => fx.current?.burst("firework", 0.5, 0.35)],
  ]);

  const tap = () => { fx.current?.burst("sparks", 0.5, 0.5); setWiggle((n) => n + 1); };

  return (
    <div key={replayKey} className="lw-root relative flex size-full flex-col items-center overflow-hidden text-ivory">
      {STARS.map(([x, y, s, delay], i) => (
        <span key={i} aria-hidden className="cc-tw pointer-events-none absolute rounded-full bg-[#fff3d6]" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${delay}s` }} />
      ))}
      <ArtStage ratio={1} maxRem={compact ? 15 : 24}>
        <div className="relative size-full" style={{ containerType: "inline-size" }}>
          <ParticleBurst ref={fx} />

          {/* soft golden halo + rose / lavender rim lights behind Lumi */}
          <div aria-hidden className="lw-halo pointer-events-none absolute left-1/2 top-[52%] aspect-square w-[92%] rounded-full" style={{ ...d(T.rise), background: "radial-gradient(closest-side, rgb(255 214 130 / 0.55), rgb(244 195 113 / 0.18) 55%, transparent 74%)" }} />
          <div aria-hidden className="pointer-events-none absolute -left-[6%] top-[40%] aspect-square w-[46%] rounded-full opacity-70 blur-2xl" style={{ background: "radial-gradient(closest-side, rgb(156 126 219 / 0.55), transparent 72%)" }} />
          <div aria-hidden className="pointer-events-none absolute -right-[6%] top-[22%] aspect-square w-[42%] rounded-full opacity-70 blur-2xl" style={{ background: "radial-gradient(closest-side, rgb(217 105 163 / 0.5), transparent 72%)" }} />

          {/* the first glowing star */}
          <div aria-hidden className="lw-orb cc-only-motion pointer-events-none absolute left-1/2 top-[52%] aspect-square w-[34%] rounded-full" style={{ background: "radial-gradient(closest-side, #fffbe9 0%, rgb(255 224 150 / 0.9) 30%, rgb(244 195 113 / 0.35) 62%, transparent 76%)" }} />

          {/* gathering golden motes */}
          <div aria-hidden className="cc-only-motion pointer-events-none absolute left-1/2 top-[52%] size-0">
            {MOTES.map((m, i) => (
              <span key={i} className="lw-gather absolute -left-1 -top-1 rounded-full bg-[#ffe3a8] shadow-[0_0_10px_3px_rgb(244_195_113/0.8)]" style={{ ...d(T.gather + m.delay), "--a": `${m.a}deg`, "--r": `${m.r}cqw`, width: m.s, height: m.s } as React.CSSProperties} />
            ))}
          </div>

          {/* Lumi: tap or press Enter/Space for more sparkles */}
          <div className="lw-rise absolute inset-x-[10%] bottom-[5%] top-[19%]" style={d(T.rise)}>
            <div className="lw-celebrate size-full" style={d(T.celebrate)}>
              <div className="lw-notice size-full" style={d(T.notice)}>
                <div className="lw-hop size-full" style={d(T.wake)}>
                  <button type="button" onClick={tap} aria-label="Lumi, a golden star. Tap for more sparkles" className="lw-lumi-btn relative block size-full">
                    <span key={wiggle} className={`block size-full ${wiggle ? "lw-wiggle" : ""}`}>
                      <Image src="/art/lumi/lumi-awake.webp" alt="" fill priority sizes="(min-width: 640px) 24rem, 80vw" draggable={false} className="lw-awake pointer-events-none select-none object-contain drop-shadow-[0_18px_30px_rgba(244,195,113,0.35)]" style={d(T.wake)} />
                      <Image src="/art/lumi/lumi-asleep.webp" alt="" fill priority sizes="(min-width: 640px) 24rem, 80vw" draggable={false} className="lw-asleep cc-only-motion pointer-events-none select-none object-contain drop-shadow-[0_18px_30px_rgba(244,195,113,0.35)]" style={d(T.wake)} />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* the recipient's name, revealed by Lumi */}
          <p className="lw-name pointer-events-none absolute inset-x-[4%] top-[1%] z-10 text-balance break-words text-center font-display leading-tight" style={{ ...d(T.name), fontSize: "clamp(1.6rem, 9cqw, 3.1rem)" }}>
            {recipientName}
          </p>

          {/* final wish: a ripple, a shooting wish-star and floating words */}
          <div aria-hidden className="lw-ripple cc-only-motion pointer-events-none absolute left-1/2 top-[52%] aspect-square w-[60%] rounded-full border-2 border-[#ffe3a8]/70" style={d(T.wish)} />
          <svg aria-hidden viewBox="-12 -12 24 24" className="lw-wish-star cc-only-motion pointer-events-none absolute left-1/2 top-[44%] z-10 w-[9%] drop-shadow-[0_0_8px_rgba(255,227,168,0.9)]" style={{ ...d(T.wish), "--tx": "34cqw", "--ty": "-34cqw" } as React.CSSProperties}>
            <path d="M0 -11 L2.6 -2.6 L11 0 L2.6 2.6 L0 11 L-2.6 2.6 L-11 0 L-2.6 -2.6 Z" fill="#ffe3a8" />
          </svg>
          <div aria-hidden className="cc-only-motion pointer-events-none absolute inset-x-0 bottom-[14%] z-10 h-[40%] overflow-hidden">
            {WISHES.map(([w, x, delay]) => (
              <span key={w} className="lw-wish-word absolute bottom-0 text-sm uppercase tracking-[0.3em] text-[#ffe3a8]/90" style={{ left: `${x}%`, ...d(T.wish + 0.8 + delay) }}>{w}</span>
            ))}
          </div>
        </div>
      </ArtStage>
      <GreetingPanel {...{ recipientName, senderName, message, greeting, compact }} start={T.panel} tone="gold" hint="Tap Lumi for a little more magic" />
    </div>
  );
}
