"use client";

import { useRef } from "react";
import { ArtStage } from "../parts/ArtStage";
import { GreetingPanel } from "../parts/GreetingPanel";
import { ParticleBurst, type BurstHandle } from "../parts/ParticleBurst";
import { useSchedule } from "../parts/useSchedule";
import type { SceneProps } from "../types";

const BULBS = [6, 17, 28, 39, 50, 61, 72, 83, 94];

/** Midnight plum and gold: a sunburst, string lights, clinking flutes, confetti. */
export function NewYearCelebrationScene({ recipientName, senderName, message, greeting, replayKey, compact = false }: SceneProps) {
  const fx = useRef<BurstHandle>(null);
  useSchedule(replayKey, [
    [2300, () => fx.current?.burst("sparks", 0.5, 0.42)],
    [2900, () => fx.current?.burst("confetti")],
    [5200, () => fx.current?.burst("confetti")],
  ]);
  const tap = () => { fx.current?.burst("confetti"); fx.current?.burst("sparks", 0.5, 0.42); };

  return (
    <div key={replayKey} className="relative flex size-full flex-col items-center overflow-hidden bg-[radial-gradient(100%_70%_at_50%_40%,#4a2a5f,#241238_60%,#12091f)] text-ivory">
      <div aria-hidden className="cc-spin cc-rays pointer-events-none absolute left-1/2 top-[30%] aspect-square w-[170%] -translate-x-1/2 -translate-y-1/2 opacity-60 [mask-image:radial-gradient(closest-side,#000_20%,transparent)]" style={{ background: "repeating-conic-gradient(from 0deg, rgb(244 195 113/.35) 0 4deg, transparent 4deg 15deg)", "--d": "0.2s" } as React.CSSProperties} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16">
        {BULBS.map((x, i) => (
          <span key={x} className="cc-fade absolute" style={{ left: `${x}%`, top: `${i % 2 ? 22 : 10}px`, "--d": `${0.3 + i * 0.2}s` } as React.CSSProperties}>
            <span className="cc-tw block size-2.5 -translate-x-1/2 rounded-full bg-gold" style={{ boxShadow: "0 0 16px 5px rgb(244 195 113 / 0.7)", "--d": `${i * 0.25}s` } as React.CSSProperties} />
          </span>
        ))}
      </div>
      <ArtStage ratio={1} maxRem={20}>
        <button type="button" onClick={tap} aria-label="Celebrate with confetti" className="relative block size-full rounded-3xl">
          <ParticleBurst ref={fx} />
          <svg viewBox="0 0 300 300" className="size-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="flute" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FFF8F4" stopOpacity=".55" /><stop offset=".5" stopColor="#F7E6EF" stopOpacity=".18" /><stop offset="1" stopColor="#FFF8F4" stopOpacity=".5" /></linearGradient>
              <linearGradient id="bubbly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FBDB98" /><stop offset="1" stopColor="#E9AE55" /></linearGradient>
            </defs>
            <g className="cc-clink-l" style={{ transformBox: "fill-box" }}>
              <g transform="translate(70 70)">
                <path d="M0 0 H52 C54 58 44 92 30 110 V176 H46 V188 H6 V176 H22 V110 C8 92 -2 58 0 0 Z" fill="url(#flute)" stroke="#FFF8F4" strokeOpacity=".7" strokeWidth="2" />
                <path d="M4 22 H48 C50 64 42 90 30 106 V110 C18 90 4 64 4 22Z" fill="url(#bubbly)" opacity=".9" />
                {[18, 30, 24].map((x, i) => <circle key={i} className="cc-bubble cc-only-motion" style={{ "--d": `${i * 0.9}s` } as React.CSSProperties} cx={x + 4} cy={90 - i * 6} r="2.2" fill="#FFF8F4" />)}
              </g>
            </g>
            <g className="cc-clink-r" style={{ transformBox: "fill-box" }}>
              <g transform="translate(178 70)">
                <path d="M0 0 H52 C54 58 44 92 30 110 V176 H46 V188 H6 V176 H22 V110 C8 92 -2 58 0 0 Z" fill="url(#flute)" stroke="#FFF8F4" strokeOpacity=".7" strokeWidth="2" />
                <path d="M4 22 H48 C50 64 42 90 30 106 V110 C18 90 4 64 4 22Z" fill="url(#bubbly)" opacity=".9" />
                {[22, 34, 28].map((x, i) => <circle key={i} className="cc-bubble cc-only-motion" style={{ "--d": `${0.4 + i * 0.9}s` } as React.CSSProperties} cx={x} cy={92 - i * 6} r="2.2" fill="#FFF8F4" />)}
              </g>
            </g>
            <g className="cc-pop" style={{ "--d": "2.3s", transformOrigin: "150px 78px" } as React.CSSProperties}>
              <path d="M150 54 l5 14 14 5 -14 5 -5 14 -5 -14 -14 -5 14 -5z" fill="#F4C371" />
            </g>
          </svg>
        </button>
      </ArtStage>
      <GreetingPanel {...{ recipientName, senderName, message, greeting, compact }} start={4.2} tone="gold" hint="Tap the glasses for confetti" />
    </div>
  );
}
