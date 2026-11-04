"use client";

import { usePrefersReducedMotion } from "@/lib/useMediaQuery";

/** Shared personalised greeting. Text is real DOM from the first paint and ends fully visible. */
export function GreetingPanel({
  recipientName, senderName, message, greeting, start, compact = false, hint = "Tap the card for a little more magic", tone = "dark",
}: {
  recipientName: string; senderName: string; message: string; greeting: string;
  /** Seconds into the timeline when the panel begins to appear */
  start: number; compact?: boolean; hint?: string; tone?: "dark" | "warm" | "gold";
}) {
  const reduced = usePrefersReducedMotion();
  const d = (n: number) => ({ "--d": `${start + n}s` }) as React.CSSProperties;
  const bg = tone === "warm" ? "bg-[#2b1420]/60 ring-[#f4c371]/30" : tone === "gold" ? "bg-[#1b0f2b]/65 ring-[#f4c371]/40" : "bg-midnight/55 ring-white/15";
  return (
    <section aria-label="Your greeting" className="relative z-10 mt-auto w-full px-6 pb-[max(2.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-ivory">
      <div style={d(0)} className={`cc-up mx-auto max-w-md rounded-[1.75rem] ring-1 backdrop-blur-md ${bg} ${compact ? "p-4" : "p-6"}`}>
        <p style={d(0)} className="cc-up text-xs uppercase tracking-[0.22em] text-gold">For {recipientName}</p>
        <h2 style={d(0.1)} className={`cc-up mt-1 font-display leading-tight ${compact ? "text-2xl" : "text-4xl"}`}>{greeting}</h2>
        <p style={d(0.8)} className={`cc-up mt-3 overflow-y-auto whitespace-pre-line break-words leading-relaxed text-ivory/95 ${compact ? "max-h-24 text-sm" : "max-h-[26dvh] text-lg"}`}>{message}</p>
        <p style={d(1.7)} className="cc-up mt-3 font-display text-lg text-gold">With love, {senderName}</p>
        {!reduced && <p style={d(2.4)} className="cc-up mt-3 text-xs text-ivory/70">{hint}</p>}
      </div>
    </section>
  );
}
