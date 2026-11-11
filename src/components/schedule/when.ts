import { checkWindow, describeInstant, offsetLabel, resolveLocal, scheduleWindow, toLocal, type Choice } from "@/modules/scheduling/time";

export type When = { localDate: string; localTime: string; timeZone: string; ambiguity?: Choice };

export type Evaluation =
  | { status: "incomplete" }
  | { status: "ready"; summary: string; instant: Date }
  | { status: "error"; code: string; message: string; suggestion?: { localDate: string; localTime: string } }
  | { status: "ambiguous"; options: { choice: Choice; label: string }[] };

/** Live, client-side preview of what the server will decide (same pure code). The server remains the authority. */
export function evaluateWhen(w: When, now: Date, monthsAhead: number): Evaluation {
  if (!w.localDate || !w.localTime || !w.timeZone) return { status: "incomplete" };
  const r = resolveLocal(w.localDate, w.localTime, w.timeZone, w.ambiguity);
  if (r.kind === "invalid") return { status: "error", code: r.reason, message: r.reason === "DATE" ? "Choose a real calendar date." : r.reason === "TIME" ? "Choose a valid time." : "Choose a valid time zone." };
  if (r.kind === "nonexistent") return { status: "error", code: "NONEXISTENT_LOCAL_TIME", message: `${w.localTime} doesn't exist on that day in ${w.timeZone.replace(/_/g, " ")}: the clocks skip forward. Please choose a valid time.`, suggestion: r.suggestion };
  if (r.kind === "ambiguous") {
    return { status: "ambiguous", options: r.options.map((o) => ({ choice: o.choice, label: `${o.choice === "earlier" ? "The first" : "The second"} ${w.localTime}: UTC${offsetLabel(o.offsetMinutes)}` })) };
  }
  const c = checkWindow(r.instant, now, monthsAhead);
  if (!c.ok) {
    return { status: "error", code: c.code, message: c.code === "IN_THE_PAST" ? "Choose a time that's still in the future (at least 5 minutes from now)." : `You can schedule up to ${monthsAhead} calendar month${monthsAhead === 1 ? "" : "s"} ahead. The latest time you can choose is ${describeInstant(c.window.latest, w.timeZone)}.` };
  }
  return { status: "ready", summary: describeInstant(r.instant, w.timeZone), instant: r.instant };
}

/** Native date-input bounds in the chosen zone (a hint: the exact check is evaluateWhen / the server). */
export const dateBounds = (now: Date, monthsAhead: number, tz: string) => {
  const w = scheduleWindow(now, monthsAhead);
  return { min: toLocal(w.earliest, tz).localDate, max: toLocal(w.latest, tz).localDate };
};
