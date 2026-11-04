"use client";

import { useRef } from "react";
import { ArtStage } from "../parts/ArtStage";
import { GreetingPanel } from "../parts/GreetingPanel";
import { ParticleBurst, type BurstHandle } from "../parts/ParticleBurst";
import { useSchedule } from "../parts/useSchedule";
import { SceneBackdrop, SceneForeground } from "../parts/ArtLayers";
import type { SceneProps } from "../types";

const COUNT = [5, 4, 3, 2, 1];

/** Cinematic countdown (5..1, ~0.8s each) into golden fireworks and a persistent 2027. */
export function NewYear2027Scene({ recipientName, senderName, message, greeting, replayKey, compact = false }: SceneProps) {
  const fx = useRef<BurstHandle>(null);
  useSchedule(replayKey, [
    [4700, () => fx.current?.burst("firework", 0.5, 0.35)],
    [5400, () => fx.current?.burst("firework", 0.22, 0.28)],
    [6000, () => fx.current?.burst("firework", 0.78, 0.3)],
    [6800, () => fx.current?.burst("firework", 0.4, 0.2)],
  ]);
  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    fx.current?.burst("firework", (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  return (
    <div key={replayKey} onClick={tap} className="relative flex size-full cursor-pointer flex-col items-center overflow-hidden bg-[radial-gradient(90%_60%_at_50%_35%,#3a2250,#160c26_65%,#0a0612)] text-ivory">
      <SceneBackdrop k="new-year-2027" />
      <ParticleBurst ref={fx} />
      <ArtStage ratio={1} maxRem={22}>
        <div className="relative grid size-full place-items-center" aria-label="Countdown to 2027" role="img">
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" aria-hidden>
            <circle cx="100" cy="100" r="92" fill="none" stroke="#F4C371" strokeOpacity=".25" strokeWidth="1" />
            <circle className="cc-draw cc-only-motion" style={{ "--len": 580, "--d": "0.2s", transformOrigin: "100px 100px", transform: "rotate(-90deg)", animationDuration: "4.3s" } as React.CSSProperties} cx="100" cy="100" r="92" fill="none" stroke="#F4C371" strokeWidth="2.5" strokeLinecap="round" />
            <circle className="cc-fade" style={{ "--d": "4.6s" } as React.CSSProperties} cx="100" cy="100" r="92" fill="none" stroke="#F4C371" strokeWidth="2.5" />
          </svg>
          {COUNT.map((n, i) => (
            <span key={n} aria-hidden className="cc-slot cc-only-motion absolute font-display text-[clamp(5rem,38cqw,11rem)] font-semibold leading-none text-gold [text-shadow:0_0_40px_rgb(244_195_113/0.6)]" style={{ "--d": `${0.4 + i * 0.8}s`, "--dur": "0.85s" } as React.CSSProperties}>{n}</span>
          ))}
          <span className="cc-pop absolute text-center font-display font-semibold leading-none tracking-tight text-gold [text-shadow:0_0_50px_rgb(244_195_113/0.65)]" style={{ "--d": "4.5s", fontSize: "clamp(3.2rem,26cqw,7.5rem)" } as React.CSSProperties}>
            2027
          </span>
        </div>
      </ArtStage>
      <SceneForeground k="new-year-2027" />
      <GreetingPanel {...{ recipientName, senderName, message, greeting, compact }} start={6.2} tone="gold" hint="Tap anywhere for fireworks" />
    </div>
  );
}
