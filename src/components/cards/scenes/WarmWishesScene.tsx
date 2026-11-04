"use client";

import { SnowCanvas } from "@/components/landing/SnowCanvas";
import { ArtStage } from "../parts/ArtStage";
import { GreetingPanel } from "../parts/GreetingPanel";
import { ArtSlot, SceneBackdrop, SceneForeground } from "../parts/ArtLayers";
import type { SceneProps } from "../types";

const BULBS = [8, 20, 32, 44, 56, 68, 80, 92];
const BULB_COLORS = ["#F4C371", "#FFB36B", "#F4C371", "#E98FB8", "#F4C371", "#FFB36B", "#F4C371", "#E98FB8"];

/** Cosy interior: warm amber light, a frosted window onto softly falling snow, a flickering candle. */
export function WarmWishesScene({ recipientName, senderName, message, greeting, replayKey, compact = false }: SceneProps) {
  return (
    <div key={replayKey} className="relative flex size-full flex-col items-center overflow-hidden bg-[linear-gradient(180deg,#2b1420_0%,#4a2230_45%,#8a4a3a_100%)] text-ivory">
      <SceneBackdrop k="warm-wishes" />
      {/* string lights along the top */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20">
        <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-14 w-full"><path d="M0 2 Q12.5 12 25 4 T50 4 T75 4 T100 3" fill="none" stroke="#1a0c14" strokeWidth=".5" /></svg>
        {BULBS.map((x, i) => (
          <span key={x} className="cc-fade absolute" style={{ left: `${x}%`, top: `${i % 2 ? 22 : 12}px`, "--d": `${0.4 + i * 0.25}s` } as React.CSSProperties}>
            <span className="cc-tw block size-3 -translate-x-1/2 rounded-full" style={{ background: BULB_COLORS[i], boxShadow: `0 0 18px 6px ${BULB_COLORS[i]}99`, "--d": `${i * 0.3}s` } as React.CSSProperties} />
          </span>
        ))}
      </div>
      <ArtStage ratio={300 / 340} maxRem={22}>
        <div className="cc-fade relative size-full" style={{ "--d": "0.3s" } as React.CSSProperties}>
          <ArtSlot k="warm-wishes"><svg viewBox="0 0 300 340" className="size-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b2347" /><stop offset="1" stopColor="#4b4a86" /></linearGradient>
              <radialGradient id="candleGlow"><stop offset="0" stopColor="#FFE3A8" stopOpacity=".9" /><stop offset="1" stopColor="#FFB36B" stopOpacity="0" /></radialGradient>
              <clipPath id="pane"><path d="M62 306 V120 Q62 40 150 40 Q238 40 238 120 V306 Z" /></clipPath>
            </defs>
            <path d="M48 316 V118 Q48 26 150 26 Q252 26 252 118 V316 Z" fill="#6b3a2a" />
            <path d="M62 306 V120 Q62 40 150 40 Q238 40 238 120 V306 Z" fill="url(#night)" />
            <g clipPath="url(#pane)">
              <circle cx="196" cy="92" r="16" fill="#FFF8F4" opacity=".9" /><circle cx="203" cy="88" r="14" fill="#2b3566" />
              <path d="M62 250 L88 190 L110 250 Z M96 262 L128 176 L158 262 Z M150 258 L178 196 L206 258 Z M196 262 L222 204 L246 262 Z" fill="#101a35" />
              <rect x="62" y="248" width="176" height="60" fill="#e9dff0" />
            </g>
            <path d="M150 40 V306 M62 170 H238" stroke="#6b3a2a" strokeWidth="6" />
            <path d="M62 306 V120 Q62 40 150 40 Q238 40 238 120 V306 Z" fill="none" stroke="#2b1420" strokeOpacity=".5" strokeWidth="2" />
            <rect x="38" y="306" width="224" height="16" rx="5" fill="#8a5238" />
            {/* candle on the sill */}
            <circle cx="214" cy="270" r="46" fill="url(#candleGlow)" className="cc-flick" style={{ mixBlendMode: "screen" }} />
            <rect x="206" y="282" width="16" height="24" rx="3" fill="#FFF3E2" />
            <ellipse cx="214" cy="274" rx="4.5" ry="9" fill="#FFB347" className="cc-flick" />
            <ellipse cx="214" cy="276" rx="2" ry="5" fill="#FFF3C4" className="cc-flick" />
            {/* wreath-like berries on the left of the sill */}
            <g><circle cx="78" cy="298" r="6" fill="#c2415e" /><circle cx="90" cy="302" r="6" fill="#c2415e" /><path d="M70 304 Q84 286 100 304" fill="none" stroke="#2f7a63" strokeWidth="5" strokeLinecap="round" /></g>
          </svg></ArtSlot>
          {/* snow falling outside only (inside the window pane) */}
          <div aria-hidden className="absolute inset-0" style={{ clipPath: "inset(12% 20.7% 10.5% 20.7% round 45% 45% 0 0)" }}>
            <SnowCanvas count={55} speed={0.55} color="255,248,244" />
          </div>
        </div>
      </ArtStage>
      <SceneForeground k="warm-wishes" />
      <GreetingPanel {...{ recipientName, senderName, message, greeting, compact }} start={3.2} tone="warm" hint="Wishing you warmth this season" />
    </div>
  );
}
