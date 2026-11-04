"use client";

import { useRef } from "react";
import { ArtStage } from "../parts/ArtStage";
import { GreetingPanel } from "../parts/GreetingPanel";
import { ParticleBurst, type BurstHandle } from "../parts/ParticleBurst";
import { useSchedule } from "../parts/useSchedule";
import type { SceneProps } from "../types";

export function SpecialGiftScene({ recipientName, senderName, message, greeting, replayKey, compact = false }: SceneProps) {
  const fx = useRef<BurstHandle>(null);
  // Lid pops at 2.4s: golden particles rise from the box mouth.
  useSchedule(replayKey, [[2500, () => fx.current?.burst("sparks", 0.5, 0.42)], [3000, () => fx.current?.burst("sparks", 0.45, 0.4)], [3500, () => fx.current?.burst("sparks", 0.55, 0.4)]]);
  const tap = () => fx.current?.burst("sparks", 0.5, 0.42);

  return (
    <div key={replayKey} className="relative flex size-full flex-col items-center overflow-hidden bg-[radial-gradient(100%_70%_at_50%_45%,#6d2b5b,#2a1b3d_62%,#170f24)] text-ivory">
      {/* soft golden light from the open box */}
      <div aria-hidden className="cc-rays pointer-events-none absolute left-1/2 top-[12%] h-[60%] w-[150%] -translate-x-1/2 opacity-90 [mask-image:radial-gradient(closest-side,#000,transparent)]" style={{ "--d": "2.4s", background: "conic-gradient(from 180deg at 50% 62%, transparent 0 8%, rgb(244 195 113/.55) 10% 12%, transparent 14% 24%, rgb(244 195 113/.4) 26% 28%, transparent 30% 70%, rgb(244 195 113/.4) 72% 74%, transparent 76% 86%, rgb(244 195 113/.55) 88% 90%, transparent 92%)" } as React.CSSProperties} />
      <ArtStage ratio={1} maxRem={22}>
        <button type="button" onClick={tap} aria-label="Release more golden sparkles" className="relative block size-full rounded-3xl">
          <ParticleBurst ref={fx} />
          <svg viewBox="0 0 300 300" className="size-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="giftBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E680B3" /><stop offset="1" stopColor="#A93E7C" /></linearGradient>
              <linearGradient id="giftGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E9AE55" /><stop offset=".5" stopColor="#FBDB98" /><stop offset="1" stopColor="#E9AE55" /></linearGradient>
              <radialGradient id="mouth"><stop offset="0" stopColor="#FFF8F4" /><stop offset=".5" stopColor="#F4C371" /><stop offset="1" stopColor="#F4C371" stopOpacity="0" /></radialGradient>
            </defs>
            <ellipse cx="150" cy="276" rx="104" ry="12" fill="#000" opacity=".35" />
            {/* light spilling out of the opened box */}
            <ellipse className="cc-fade" style={{ "--d": "2.4s" } as React.CSSProperties} cx="150" cy="150" rx="84" ry="22" fill="url(#mouth)" />
            <g className="cc-up" style={{ "--d": "0.2s" } as React.CSSProperties}>
              <rect x="60" y="150" width="180" height="124" rx="10" fill="url(#giftBody)" />
              <rect x="136" y="150" width="28" height="124" fill="url(#giftGold)" />
              <rect x="60" y="150" width="180" height="10" fill="#000" opacity=".18" />
            </g>
            {/* lid + bow: closed at first, lifts off and tilts away */}
            <g className="cc-lid" style={{ "--d": "2.2s" } as React.CSSProperties}>
              <rect x="50" y="112" width="200" height="44" rx="9" fill="url(#giftBody)" />
              <rect x="136" y="112" width="28" height="44" fill="url(#giftGold)" />
              <path d="M150 112 C108 64 70 84 104 112 Z" fill="url(#giftGold)" />
              <path d="M150 112 C192 64 230 84 196 112 Z" fill="url(#giftGold)" />
              <path d="M150 112 C128 84 118 92 124 108 M150 112 C172 84 182 92 176 108" stroke="#C98A32" strokeWidth="2" fill="none" />
              <circle cx="150" cy="108" r="11" fill="url(#giftGold)" />
            </g>
            <g className="cc-fade cc-only-motion" style={{ "--d": "2.6s" } as React.CSSProperties}>
              {[[96, 70], [210, 54], [60, 110], [246, 100]].map(([x, y], i) => (
                <path key={i} className="cc-tw" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${3 + i * 0.4}s` }} d={`M${x} ${y - 8} L${x + 2} ${y - 2} L${x + 8} ${y} L${x + 2} ${y + 2} L${x} ${y + 8} L${x - 2} ${y + 2} L${x - 8} ${y} L${x - 2} ${y - 2}Z`} fill="#F4C371" />
              ))}
            </g>
          </svg>
        </button>
      </ArtStage>
      <GreetingPanel {...{ recipientName, senderName, message, greeting, compact }} start={4.4} hint="Tap the gift for more sparkles" />
    </div>
  );
}
