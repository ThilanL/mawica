"use client";

import { useSyncExternalStore } from "react";

export type Market = { city: string; country: string; code: string; tz: string };

const fmt = new Map<string, Intl.DateTimeFormat>();
function local(tz: string, now: Date) {
  let f = fmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    fmt.set(tz, f);
  }
  const time = f.format(now);
  return { time, day: (() => { const h = Number(time.slice(0, 2)); return h >= 6 && h < 18; })() };
}

const TICK = 15_000;
const subscribe = (onChange: () => void) => {
  const id = window.setInterval(onChange, TICK);
  return () => window.clearInterval(id);
};

/** Live local time in each launch city. Server HTML shows a placeholder so hydration never mismatches. */
export function WorldClocks({ markets }: { markets: readonly Market[] }) {
  const tick = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / TICK), () => null);
  const now = tick === null ? null : new Date(tick * TICK);

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {markets.map((m) => {
        const t = now ? local(m.tz, now) : null;
        return (
          <li key={m.code} className="ab-city flex flex-col rounded-2xl p-3.5 max-sm:last:col-span-2 sm:p-4">
            <span className="flex items-center justify-between">
              <span aria-hidden className="grid h-6 place-items-center rounded-md px-1.5 text-[0.65rem] font-bold tracking-wider" style={{ color: "#a63d78", background: "rgb(166 61 120 / 0.1)" }}>
                {m.code}
              </span>
              {t && (
                <svg viewBox="0 0 16 16" aria-hidden className="size-4" style={{ color: t.day ? "#d99a2b" : "#6c4fb5" }} fill="currentColor">
                  {t.day ? <circle cx="8" cy="8" r="3.6" /> : <path d="M13 10.2A5.6 5.6 0 0 1 5.8 3a5.6 5.6 0 1 0 7.2 7.2z" />}
                </svg>
              )}
            </span>
            <span className="mt-3 font-display text-2xl leading-none tabular-nums text-midnight sm:mt-4 sm:text-3xl">
              <span className="sr-only">Local time in {m.city}: </span>
              {t ? t.time : "--:--"}
            </span>
            <span className="mt-2 text-sm font-semibold text-midnight">{m.city}</span>
            <span className="text-xs leading-snug text-ink-soft">{m.country}</span>
          </li>
        );
      })}
    </ul>
  );
}
