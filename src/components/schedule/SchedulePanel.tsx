"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { describeInstant } from "@/modules/scheduling/time";
import { LINK_DELIVERY_NOTICE } from "@/modules/delivery/notices";
import { WhenFields } from "./WhenFields";
import { evaluateWhen, type When } from "./when";
import { useBrowserZone } from "./useTimeZones";

type CardInput = { templateKey: string; recipientName: string; senderName: string; message: string; mediaId?: string };
type Done = { deliverAtUtc: string; timeZone: string; premium: boolean; cardsRemaining: number; premiumRemaining: number };

/** Schedule-for-later form for the creation flow (signed-in users). All rules are enforced again on the server. */
export function SchedulePanel({ card, premium, cards, premiumCredits, monthsAhead, onEditCard }: { card: CardInput; premium: boolean; cards: number | null; premiumCredits: number | null; monthsAhead: number; onEditCard: () => void }) {
  const zone = useBrowserZone();
  const [now] = useState(() => new Date());
  const [when, setWhen] = useState<When>({ localDate: "", localTime: "09:00", timeZone: "" });
  const tz = when.timeZone || zone;
  const w = { ...when, timeZone: tz };
  const ev = evaluateWhen(w, now, monthsAhead);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const idem = useRef<string | null>(null);

  const noCredit = premium ? (premiumCredits !== null && premiumCredits < 1) || (cards !== null && cards < 1) : cards !== null && cards < 1;
  const change = (next: When) => { idem.current = null; setError(null); setConfirming(false); setWhen(next); };

  async function submit() {
    if (busy || ev.status !== "ready") return;
    setBusy(true); setError(null);
    idem.current ??= crypto.randomUUID();
    try {
      const res = await fetch("/api/schedules", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": idem.current },
        body: JSON.stringify({ ...card, saveRecipient: true, schedule: { localDate: w.localDate, localTime: w.localTime, timeZone: w.timeZone, ...(w.ambiguity ? { ambiguity: w.ambiguity } : {}) } }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setDone({ deliverAtUtc: j.schedule.deliverAtUtc, timeZone: j.schedule.timeZone, premium, cardsRemaining: j.wallet.cardsRemaining, premiumRemaining: j.wallet.premiumRemaining }); return; }
      setConfirming(false);
      if (res.status === 401) setError("Please sign in again to schedule this card.");
      else if (res.status === 402) setError(j.code === "INSUFFICIENT_PREMIUM_CREDITS" ? "You don't have a premium credit available, so nothing was scheduled or used." : "You've used all your cards for this month, so nothing was scheduled or used.");
      else if (res.status === 422 && j.code === "IDEMPOTENCY_KEY_REUSED") { idem.current = null; setError("That changed since your last try. Please confirm again."); }
      else if (res.status === 422 || res.status === 400) setError(j.error ?? "Please check the date and time.");
      else setError("Something went wrong and nothing was scheduled. Please try again.");
    } catch { setError("Could not reach the server. Nothing was scheduled; check your connection and try again."); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <div role="status" className="mx-auto mt-8 max-w-md rounded-[1.75rem] bg-[linear-gradient(150deg,#3a2556,#2a1b3d)] p-7 text-center text-ivory shadow-lift">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Scheduled</p>
        <h2 className="mt-2 font-display text-3xl">It&rsquo;s on its way</h2>
        <p className="mt-3 text-ivory/90">Your card for {card.recipientName} will be delivered on {describeInstant(new Date(done.deliverAtUtc), done.timeZone)}.</p>
        <p className="mt-3 text-sm text-ivory/90">{LINK_DELIVERY_NOTICE}</p>
        <p className="mt-3 text-sm text-ivory/75">Its link stays private until then. You have {done.cardsRemaining} card{done.cardsRemaining === 1 ? "" : "s"}{done.premium ? ` and ${done.premiumRemaining} premium credit${done.premiumRemaining === 1 ? "" : "s"}` : ""} left this month.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/account/scheduled" className="inline-flex items-center justify-center rounded-full bg-ivory px-6 py-3 text-sm font-semibold text-midnight transition hover:bg-white focus-visible:outline-offset-4">View scheduled cards</Link>
          <a href="/create" className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-ivory transition hover:bg-white/10 focus-visible:outline-offset-4">Make another card</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-8 max-w-md text-left">
      <div className="rounded-[1.75rem] bg-[linear-gradient(135deg,#f7e6ef,#e9defb)] p-5 ring-1 ring-midnight/5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#6c4fb5" }}>Schedule for later</p>
        <div className="mt-4"><WhenFields value={w} onChange={change} now={now} monthsAhead={monthsAhead} serverMessage={error} /></div>
        <p className="mt-4 text-sm text-midnight">{LINK_DELIVERY_NOTICE}</p>
        <p className="mt-3 text-sm text-midnight">
          Scheduling reserves <strong>1 card</strong>{premium && <> and <strong>1 premium credit</strong></>} now. Cancel before delivery and it&rsquo;s released while it is still within the allowance period it came from.
          {" "}You can schedule up to {monthsAhead} calendar month{monthsAhead === 1 ? "" : "s"} ahead.
        </p>
        {noCredit && <p role="alert" className="mt-3 rounded-2xl bg-[#fdecf1] px-4 py-3 text-sm text-[#7a1738]">{premium && premiumCredits !== null && premiumCredits < 1 ? "You have no premium credits left, so this card can't be scheduled." : "You've used all your cards for this month, so nothing can be scheduled yet."}</p>}
      </div>

      {confirming && ev.status === "ready" && (
        <div role="alertdialog" aria-labelledby="sc-title" className="mt-4 rounded-[1.5rem] bg-white p-5 shadow-soft ring-2 ring-lavender">
          <p id="sc-title" className="font-semibold">Schedule this card for {card.recipientName}?</p>
          <p className="mt-1 text-sm text-ink-soft">Delivered on {ev.summary}. This reserves 1 card{premium ? " and 1 premium credit" : ""}.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={submit} disabled={busy}>{busy ? "Scheduling…" : "Confirm and schedule"}</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Not yet</Button>
          </div>
        </div>
      )}
      {!confirming && (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="secondary" onClick={onEditCard} disabled={busy}>Edit card</Button>
          <Button onClick={() => { setError(null); setConfirming(true); }} disabled={busy || ev.status !== "ready" || noCredit}>Schedule delivery</Button>
        </div>
      )}
    </div>
  );
}
