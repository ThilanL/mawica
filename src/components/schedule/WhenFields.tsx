"use client";

import { useId } from "react";
import { dateBounds, evaluateWhen, type When } from "./when";
import { useTimeZones } from "./useTimeZones";

const inputCls = "mt-2 block w-full rounded-2xl border border-midnight/25 bg-white px-4 py-3 text-base text-midnight shadow-sm";

/** Date, time and time zone with live validation, an explicit choice for ambiguous daylight-saving times and a clear summary. */
export function WhenFields({ value, onChange, now, monthsAhead, serverMessage }: { value: When; onChange: (w: When) => void; now: Date; monthsAhead: number; serverMessage?: string | null }) {
  const id = useId();
  const zones = useTimeZones(value.timeZone ? [value.timeZone] : []);
  const ev = evaluateWhen(value, now, monthsAhead);
  const bounds = value.timeZone ? dateBounds(now, monthsAhead, value.timeZone) : null;
  const set = (patch: Partial<When>) => onChange({ ...value, ...patch, ...("localDate" in patch || "localTime" in patch || "timeZone" in patch ? { ambiguity: undefined } : {}) });

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-d`} className="text-sm font-semibold">Date</label>
          <input id={`${id}-d`} type="date" value={value.localDate} min={bounds?.min} max={bounds?.max} onChange={(e) => set({ localDate: e.target.value })} className={inputCls} aria-describedby={`${id}-s`} />
        </div>
        <div>
          <label htmlFor={`${id}-t`} className="text-sm font-semibold">Time</label>
          <input id={`${id}-t`} type="time" value={value.localTime} onChange={(e) => set({ localTime: e.target.value })} className={inputCls} aria-describedby={`${id}-s`} />
        </div>
      </div>
      <div className="mt-4">
        <label htmlFor={`${id}-z`} className="text-sm font-semibold">Time zone</label>
        <select id={`${id}-z`} value={value.timeZone} onChange={(e) => set({ timeZone: e.target.value })} className={inputCls}>
          {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </select>
        <p className="mt-1.5 text-sm text-ink-soft">The time is the recipient&rsquo;s clock in this zone. It is never shifted for you.</p>
      </div>

      {ev.status === "ambiguous" && (
        <fieldset className="mt-4 rounded-2xl bg-[#fff6e0] p-4 ring-1 ring-gold/50">
          <legend className="px-1 text-sm font-semibold">That time happens twice that day. Which one?</legend>
          <div className="mt-2 flex flex-col gap-2">
            {ev.options.map((o) => (
              <label key={o.choice} className="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-3 py-2.5 text-sm">
                <input type="radio" name={`${id}-amb`} checked={value.ambiguity === o.choice} onChange={() => onChange({ ...value, ambiguity: o.choice })} /> {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div id={`${id}-s`} aria-live="polite" className="mt-4 min-h-6 text-sm">
        {ev.status === "ready" && !serverMessage && <p className="rounded-2xl bg-white/70 px-4 py-3 font-medium text-midnight">Delivered on {ev.summary}</p>}
        {ev.status === "error" && (
          <p role="alert" className="rounded-2xl bg-[#fdecf1] px-4 py-3 text-[#7a1738]">
            {ev.message}
            {ev.suggestion && <> <button type="button" onClick={() => set({ localDate: ev.suggestion!.localDate, localTime: ev.suggestion!.localTime })} className="font-semibold underline underline-offset-4">Use {ev.suggestion.localTime}</button></>}
          </p>
        )}
        {serverMessage && <p role="alert" className="mt-2 rounded-2xl bg-[#fdecf1] px-4 py-3 text-[#7a1738]">{serverMessage}</p>}
      </div>
    </div>
  );
}
