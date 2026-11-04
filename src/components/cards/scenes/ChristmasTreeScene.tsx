"use client";

import { useRef } from "react";
import { SnowCanvas } from "@/components/landing/SnowCanvas";
import { ArtStage } from "../parts/ArtStage";
import { GreetingPanel } from "../parts/GreetingPanel";
import { ParticleBurst, type BurstHandle } from "../parts/ParticleBurst";
import { useSchedule } from "../parts/useSchedule";
import type { SceneProps } from "../types";

// Ornaments ordered bottom to top: the tree lights up progressively.
const ORNAMENTS: { x: number; y: number; c: string }[] = [
  { x: 92, y: 322, c: "#D969A3" }, { x: 208, y: 318, c: "#F4C371" }, { x: 150, y: 330, c: "#9C7EDB" },
  { x: 118, y: 276, c: "#F4C371" }, { x: 188, y: 280, c: "#D969A3" }, { x: 150, y: 296, c: "#FFF8F4" },
  { x: 108, y: 226, c: "#9C7EDB" }, { x: 194, y: 222, c: "#F4C371" }, { x: 150, y: 244, c: "#D969A3" },
  { x: 126, y: 178, c: "#D969A3" }, { x: 176, y: 176, c: "#F4C371" }, { x: 150, y: 196, c: "#9C7EDB" },
  { x: 138, y: 134, c: "#F4C371" }, { x: 164, y: 132, c: "#D969A3" }, { x: 150, y: 96, c: "#FFF8F4" },
];
const SPARKLES = [[70, 250], [235, 200], [60, 330], [245, 300], [105, 120], [200, 110], [150, 60]];

export function ChristmasTreeScene({ recipientName, senderName, message, greeting, replayKey, compact = false }: SceneProps) {
  const fx = useRef<BurstHandle>(null);
  useSchedule(replayKey, [[5200, () => fx.current?.burst("sparks", 0.5, 0.2)]]);
  const tap = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    fx.current?.burst("sparks", (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  return (
    <div key={replayKey} className="relative flex size-full flex-col items-center overflow-hidden bg-[radial-gradient(110%_70%_at_50%_30%,#1d3a3d,#12202a_60%,#0d0f1c)] text-ivory">
      <SnowCanvas count={26} speed={0.5} className="opacity-50" />
      <ArtStage ratio={300 / 380} maxRem={24}>
        <button type="button" onClick={tap} aria-label="Make the tree sparkle" className="relative block size-full rounded-3xl focus-visible:outline-offset-8">
          <ParticleBurst ref={fx} />
          <svg viewBox="0 0 300 380" className="size-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="bough" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f8a6b" /><stop offset="1" stopColor="#14503f" /></linearGradient>
              <radialGradient id="glw"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".35" stopColor="#F4C371" stopOpacity=".55" /><stop offset="1" stopColor="#F4C371" stopOpacity="0" /></radialGradient>
            </defs>
            <ellipse cx="150" cy="362" rx="110" ry="14" fill="#000" opacity=".35" />
            <rect x="137" y="338" width="26" height="26" rx="3" fill="#6b4630" />
            <g className="cc-fade" style={{ "--d": "0.3s" } as React.CSSProperties}>
              <path d="M150 60 L70 170 H230 Z" fill="url(#bough)" />
              <path d="M150 110 L55 236 H245 Z" fill="url(#bough)" />
              <path d="M150 170 L38 310 H262 Z" fill="url(#bough)" />
              <path d="M150 232 L24 346 H276 Z" fill="url(#bough)" />
              <path d="M150 60 L70 170 M150 110 L55 236 M150 170 L38 310" stroke="#0b3a2d" strokeOpacity=".35" strokeWidth="2" />
            </g>
            {/* garland draws itself */}
            <path className="cc-draw" style={{ "--len": 330, "--d": "0.9s" } as React.CSSProperties} d="M98 150 Q150 178 202 150 M80 218 Q150 252 220 218 M62 292 Q150 332 238 292" fill="none" stroke="#F4C371" strokeWidth="2.5" strokeLinecap="round" />
            {ORNAMENTS.map((o, i) => {
              const d = 1.2 + (ORNAMENTS.length - 1 - i) * 0.22;
              return (
                <g key={i}>
                  <circle cx={o.x} cy={o.y} r="7.5" fill={o.c} className="cc-lit" style={{ "--d": `${d}s` } as React.CSSProperties} />
                  <circle cx={o.x - 2.2} cy={o.y - 2.4} r="2" fill="#fff" opacity=".75" />
                  <circle cx={o.x} cy={o.y} r="18" fill="url(#glw)" className="cc-fade" style={{ "--d": `${d}s`, mixBlendMode: "screen" } as React.CSSProperties} />
                </g>
              );
            })}
            <g className="cc-fade" style={{ "--d": "4s" } as React.CSSProperties}>
            {SPARKLES.map(([x, y], i) => (
              <path key={i} className="cc-tw" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.35}s` } as React.CSSProperties} d={`M${x} ${y - 9} L${x + 2.2} ${y - 2.2} L${x + 9} ${y} L${x + 2.2} ${y + 2.2} L${x} ${y + 9} L${x - 2.2} ${y + 2.2} L${x - 9} ${y} L${x - 2.2} ${y - 2.2} Z`} fill="#FFF8F4" />
            ))}
            </g>
            {/* star crowns the tree last */}
            <g className="cc-pop" style={{ "--d": "4.8s", transformOrigin: "150px 48px" } as React.CSSProperties}>
              <circle cx="150" cy="48" r="46" fill="url(#glw)" style={{ mixBlendMode: "screen" }} />
              <path d="M150 20 l8 20 22 2 -17 14 6 22 -19 -12 -19 12 6 -22 -17 -14 22 -2z" fill="#F4C371" stroke="#FFE3A8" strokeWidth="1.5" />
            </g>
          </svg>
        </button>
      </ArtStage>
      <GreetingPanel {...{ recipientName, senderName, message, greeting, compact }} start={5.6} hint="Tap the tree to make it sparkle" />
    </div>
  );
}
