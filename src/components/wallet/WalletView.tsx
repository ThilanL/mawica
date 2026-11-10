"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Wallet = {
  plan: { key: string; name: string; purchasable: boolean };
  period: { start: string; end: string; nextReset: string };
  sends: { limit: number; used: number; remaining: number };
  premium: { perPeriodLimit: number; remaining: number; welcomeCredit: number; periodCredit: number };
  schedulingMonthsAhead: number | null;
};
type Activity = { at: string; type: "card_published" | "card_scheduled" | "card_cancelled" | "welcome_gift"; premium: boolean; card: { title: string; slug: string } | null };
type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; wallet: Wallet; activity: Activity[] };

/** Full page load on purpose, so the session-aware header starts fresh. */
const hardNavigate = (to: string) => { window.location.href = to; };
const date = (iso: string, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) => new Date(iso).toLocaleDateString(undefined, o);
const card = "rounded-[1.75rem] bg-white/80 p-6 shadow-soft ring-1 ring-midnight/5 backdrop-blur sm:p-8";
const eyebrow = "text-sm font-semibold uppercase tracking-[0.18em] text-ink-soft";

async function getJson(path: string) {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  if (res.status === 401) { hardNavigate("/sign-in?next=/account/wallet"); throw new Error("signed out"); }
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export function WalletView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([getJson("/api/wallet"), getJson("/api/wallet/activity?limit=10")])
      .then(([w, a]) => live && setState({ kind: "ok", wallet: w.wallet, activity: a.items }))
      .catch((e: Error) => live && e.message !== "signed out" && setState({ kind: "error", message: e.message === "429" ? "You've refreshed a lot. Please wait a moment and try again." : "We couldn't load your wallet right now." }));
    return () => { live = false; };
  }, [attempt]);

  if (state.kind === "loading") return <Skeleton />;
  if (state.kind === "error") {
    return (
      <div role="alert" className={`${card} text-center`}>
        <p className="font-display text-2xl">Your wallet didn&rsquo;t load</p>
        <p className="mt-2 text-ink-soft">{state.message}</p>
        <button type="button" onClick={() => { setState({ kind: "loading" }); setAttempt((a) => a + 1); }} className="mt-6 rounded-full bg-midnight px-7 py-3.5 text-base font-semibold text-ivory shadow-soft transition hover:bg-[#3d2a56] focus-visible:outline-offset-4 active:scale-[0.98]">Try again</button>
      </div>
    );
  }

  const { wallet: w, activity } = state;
  const pct = w.sends.limit ? Math.min(100, Math.round((w.sends.used / w.sends.limit) * 100)) : 0;
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="w-remaining" className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(150deg,#3a2556,#2a1b3d_62%,#22152f)] p-6 text-ivory shadow-lift ring-1 ring-white/10 sm:p-9">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-lavender/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-rose/25 blur-3xl" />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-sm font-semibold ring-1 ring-white/20">{w.plan.name} plan</p>
          <h2 id="w-remaining" className="mt-5 flex items-baseline gap-3">
            <span className="font-display text-7xl leading-none sm:text-8xl">{w.sends.remaining}</span>
            <span className="text-lg text-ivory/80">{w.sends.remaining === 1 ? "card" : "cards"} left this month</span>
          </h2>
          <div className="mt-6" role="progressbar" aria-label="Monthly usage" aria-valuemin={0} aria-valuemax={w.sends.limit} aria-valuenow={w.sends.used}>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[linear-gradient(90deg,#d969a3,#9c7edb)]" style={{ width: `${pct}%` }} /></div>
            <p className="mt-3 flex flex-wrap justify-between gap-2 text-sm text-ivory/80"><span>{w.sends.used} of {w.sends.limit} used</span><span>Renews {date(w.period.nextReset)}</span></p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="w-premium" className={card}>
          <h2 id="w-premium" className={eyebrow}>Premium credits</h2>
          <p className="mt-4 font-display text-5xl leading-none">{w.premium.remaining}</p>
          <p className="mt-3 text-ink-soft">
            {w.premium.remaining === 0 ? "No premium credits right now." : w.premium.welcomeCredit > 0 ? "Your welcome gift: one premium card, yours to use whenever you like. It doesn't expire." : "Included with your plan this month."}
          </p>
        </section>
        <section aria-labelledby="w-usage" className={card}>
          <h2 id="w-usage" className={eyebrow}>This month</h2>
          <p className="mt-4 font-display text-5xl leading-none">{w.sends.used}<span className="text-2xl text-ink-soft"> / {w.sends.limit}</span></p>
          <p className="mt-3 text-ink-soft">Cards published since {date(w.period.start, { day: "numeric", month: "long" })}. Your allowance renews on {date(w.period.nextReset, { day: "numeric", month: "long" })}.</p>
        </section>
      </div>

      <section aria-labelledby="w-activity" className={card}>
        <h2 id="w-activity" className={eyebrow}>Recent card activity</h2>
        {!activity.some((a) => a.type !== "welcome_gift") && (
          <div className="mt-5 rounded-2xl bg-blush/60 p-6 text-center">
            <p className="font-display text-2xl">No cards yet</p>
            <p className="mt-2 text-ink-soft">Cards you publish while signed in appear here.</p>
            <Link href="/create" className="mt-5 inline-flex rounded-full bg-midnight px-6 py-3 text-sm font-semibold text-ivory shadow-soft transition hover:bg-[#3d2a56] focus-visible:outline-offset-4">Create a card</Link>
          </div>
        )}
        {activity.length > 0 && (
          <ul className="mt-4 divide-y divide-midnight/10">
            {activity.map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="font-medium">{label(a)}</p>
                  <p className="text-sm text-ink-soft">{date(a.at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{a.premium && a.type !== "welcome_gift" ? " · Premium" : ""}</p>
                </div>
                {a.card && a.type !== "card_cancelled" && <Link href={`/c/${a.card.slug}`} className="shrink-0 rounded-full border border-midnight/20 px-4 py-2 text-sm font-semibold transition hover:bg-white focus-visible:outline-offset-4">View card</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="w-how" className={card}>
        <h2 id="w-how" className={eyebrow}>How credits work</h2>
        <ul className="mt-4 space-y-3 text-ink-soft">
          <li>Each card you publish while signed in uses <strong className="text-midnight">1 card</strong> from your monthly allowance.</li>
          <li>A premium card uses 1 card <em>and</em> 1 premium credit.</li>
          <li>Your allowance renews on the same day each month. Unused cards don&rsquo;t carry over.</li>
          <li>Your welcome gift doesn&rsquo;t expire and is never replaced by a monthly reset.</li>
        </ul>
      </section>

      <section aria-labelledby="w-plus" className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#f7e6ef,#e9defb)] p-6 ring-1 ring-midnight/5 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: "#a63d78" }}>Coming soon</p>
        <h2 id="w-plus" className="mt-2 font-display text-3xl">Mawica Plus</h2>
        <p className="mt-3 max-w-md text-ink-soft">More cards each month, premium cards included, and scheduling up to 12 months ahead. We&rsquo;ll let you know here when it&rsquo;s ready.</p>
        <button type="button" disabled aria-disabled="true" className="mt-5 cursor-not-allowed rounded-full border border-midnight/20 bg-white/60 px-6 py-3 text-sm font-semibold text-midnight/60">Not available yet</button>
      </section>
    </div>
  );
}

function label(a: Activity): string {
  const title = a.card?.title ?? "Card";
  switch (a.type) {
    case "welcome_gift": return "Welcome gift added: 1 premium credit";
    case "card_cancelled": return `Cancelled: ${title}`;
    case "card_scheduled": return `Scheduled: ${title}`;
    default: return `Published: ${title}`;
  }
}

function Skeleton() {
  const bar = "animate-pulse rounded-full bg-midnight/10";
  return (
    <div role="status" aria-live="polite" aria-label="Loading your wallet" className="flex flex-col gap-6">
      <div className="h-64 animate-pulse rounded-[2rem] bg-midnight/15" />
      <div className="grid gap-6 sm:grid-cols-2"><div className="h-40 animate-pulse rounded-[1.75rem] bg-white/70" /><div className="h-40 animate-pulse rounded-[1.75rem] bg-white/70" /></div>
      <div className="rounded-[1.75rem] bg-white/70 p-8"><div className={`${bar} h-4 w-40`} /><div className={`${bar} mt-6 h-4 w-3/4`} /><div className={`${bar} mt-4 h-4 w-2/3`} /></div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
