"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { describeInstant } from "@/modules/scheduling/time";
import { LINK_DELIVERY_NOTICE, LINK_LIVE_NOTICE } from "@/modules/delivery/notices";
import { WhenFields } from "./WhenFields";
import { evaluateWhen, type When } from "./when";

const CardPlayer = dynamic(() => import("@/components/cards/CardPlayer").then((m) => m.CardPlayer), { ssr: false, loading: () => <div className="grid size-full place-items-center bg-midnight text-ivory/70">Loading preview…</div> });

type Schedule = {
  id: string; status: "SCHEDULED" | "PROCESSING" | "PUBLISHED" | "CANCELLED" | "FAILED"; deliverAtUtc: string; timeZone: string; localDate: string; localTime: string; version: number;
  card: { templateKey: string; title: string; premium: boolean; recipientName: string; senderName: string; message: string; media?: { src: string; width: number; height: number } | null };
  recipient: { id: string; name: string } | null; creditsReserved: number; link: string | null; failureNote: string | null;
};
type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; items: Schedule[]; monthsAhead: number };

const STATUS: Record<Schedule["status"], { label: string; cls: string }> = {
  SCHEDULED: { label: "Scheduled", cls: "bg-[#e9defb] text-[#4b2f8a]" },
  PROCESSING: { label: "Publishing", cls: "bg-[#fff0cf] text-[#7a5300]" },
  PUBLISHED: { label: "Live", cls: "bg-[#dcf3e6] text-[#1d6b46]" },
  CANCELLED: { label: "Cancelled", cls: "bg-[#eee9f3] text-[#5d4b73]" },
  FAILED: { label: "Couldn't publish", cls: "bg-[#fdecf1] text-[#7a1738]" },
};
const card = "rounded-[1.75rem] bg-white/80 p-5 shadow-soft ring-1 ring-midnight/5 backdrop-blur sm:p-7";
const btn = "rounded-full border border-midnight/20 bg-white/70 px-5 py-2.5 text-sm font-semibold text-midnight transition hover:bg-white focus-visible:outline-offset-4 disabled:opacity-60";
const primary = "rounded-full bg-midnight px-5 py-2.5 text-sm font-semibold text-ivory shadow-soft transition hover:bg-[#3d2a56] focus-visible:outline-offset-4 disabled:opacity-60";

/** Full page load on purpose, so the session-aware header starts fresh. */
const hardNavigate = (to: string) => { window.location.href = to; };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
  if (res.status === 401) { hardNavigate("/sign-in?next=/account/scheduled"); throw new Error("signed out"); }
  return res;
}

export function ScheduledList() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<Schedule | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [r, w] = await Promise.all([api("/api/schedules"), api("/api/wallet")]);
        if (!r.ok) throw new Error(String(r.status));
        const items = (await r.json()).schedules as Schedule[];
        const monthsAhead = w.ok ? ((await w.json()).wallet.schedulingMonthsAhead ?? 1) : 1;
        if (live) setState({ kind: "ok", items, monthsAhead });
      } catch (e) { if (live && (e as Error).message !== "signed out") setState({ kind: "error", message: "We couldn't load your scheduled cards right now." }); }
    })();
    return () => { live = false; };
  }, [attempt]);

  const replace = (s: Schedule) => setState((cur) => (cur.kind === "ok" ? { ...cur, items: cur.items.map((x) => (x.id === s.id ? s : x)) } : cur));

  if (state.kind === "loading") {
    return (
      <div role="status" aria-live="polite" aria-label="Loading your scheduled cards" className="flex flex-col gap-5">
        {[0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-[1.75rem] bg-white/70" />)}
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div role="alert" className={`${card} text-center`}>
        <p className="font-display text-2xl">Your scheduled cards didn&rsquo;t load</p>
        <p className="mt-2 text-ink-soft">{state.message}</p>
        <button type="button" onClick={() => { setState({ kind: "loading" }); setAttempt((a) => a + 1); }} className={`${primary} mt-6 px-7 py-3.5 text-base`}>Try again</button>
      </div>
    );
  }
  if (state.items.length === 0) {
    return (
      <div className={`${card} text-center`}>
        <p className="font-display text-3xl">Nothing scheduled yet</p>
        <p className="mx-auto mt-3 max-w-sm text-ink-soft">Write a card, preview it, then choose <strong>Schedule for later</strong> to have it delivered at exactly the right moment.</p>
        <Link href="/create" className={`${primary} mt-6 inline-flex px-7 py-3.5 text-base`}>Create a card</Link>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-5">
        {state.items.map((s) => <Item key={s.id} s={s} monthsAhead={state.monthsAhead} onChange={replace} onPreview={() => setPreview(s)} onRefresh={() => { setState({ kind: "loading" }); setAttempt((a) => a + 1); }} />)}
      </ul>
      {preview && <PreviewDialog s={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function Item({ s, monthsAhead, onChange, onPreview, onRefresh }: { s: Schedule; monthsAhead: number; onChange: (s: Schedule) => void; onPreview: () => void; onRefresh: () => void }) {
  const [mode, setMode] = useState<"view" | "edit" | "cancel">("view");
  const [when, setWhen] = useState<When>({ localDate: s.localDate, localTime: s.localTime, timeZone: s.timeZone });
  const [now] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = STATUS[s.status];
  const editable = s.status === "SCHEDULED";
  const ev = evaluateWhen(when, now, monthsAhead);
  const credit = s.status === "SCHEDULED" || s.status === "PROCESSING" ? `Reserved: 1 card${s.card.premium ? " and 1 premium credit" : ""}` : s.status === "CANCELLED" ? "Credit released" : s.status === "PUBLISHED" ? "Credit used" : "No credit used";

  async function save() {
    if (busy || ev.status !== "ready") return;
    setBusy(true); setError(null);
    try {
      const res = await api(`/api/schedules/${s.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...when, version: s.version }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { onChange(j.schedule); setMode("view"); return; }
      if (res.status === 409 && j.code === "STALE_VERSION") { setError(j.error); onRefresh(); return; }
      setError(j.error ?? "We couldn't save that change. Nothing was changed.");
    } catch (e) { if ((e as Error).message !== "signed out") setError("Could not reach the server. Nothing was changed."); }
    finally { setBusy(false); }
  }
  async function cancelIt() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api(`/api/schedules/${s.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { onChange(j.schedule); setMode("view"); return; }
      setError(j.error ?? "We couldn't cancel that. Nothing was changed.");
      if (res.status === 409) onRefresh();
    } catch (e) { if ((e as Error).message !== "signed out") setError("Could not reach the server. Nothing was changed."); }
    finally { setBusy(false); }
  }

  return (
    <li className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
            {s.card.premium && <span className="rounded-full bg-gold/25 px-3 py-1 text-xs font-semibold text-[#6b4a00]">★ Premium</span>}
          </p>
          <h2 className="mt-3 font-display text-2xl">{s.card.title}</h2>
          <p className="mt-1 text-ink-soft">For <strong className="text-midnight">{s.recipient?.name ?? s.card.recipientName}</strong></p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-ink-soft">Delivery</dt><dd className="mt-1 text-midnight">{describeInstant(new Date(s.deliverAtUtc), s.timeZone)}</dd></div>
        <div><dt className="font-semibold text-ink-soft">Credits</dt><dd className="mt-1 text-midnight">{credit}</dd></div>
      </dl>

      {s.status === "SCHEDULED" && mode === "view" && <p className="mt-4 text-sm text-ink-soft">{LINK_DELIVERY_NOTICE}</p>}
      {s.status === "PUBLISHED" && s.link && (
        <div className="mt-4 rounded-2xl bg-[#e9f7ef] p-4">
          <p className="text-sm font-medium text-[#1d6b46]">{LINK_LIVE_NOTICE}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a href={s.link} className="break-all text-sm font-semibold text-midnight underline underline-offset-4">{s.link}</a>
            <CopyLink link={s.link} />
          </div>
        </div>
      )}
      {s.status === "FAILED" && s.failureNote && <p role="status" className="mt-4 rounded-2xl bg-[#fdecf1] p-4 text-sm text-[#7a1738]">{s.failureNote}</p>}

      {mode === "edit" && editable && (
        <div className="mt-5 rounded-2xl bg-[linear-gradient(135deg,#f7e6ef,#e9defb)] p-4">
          <WhenFields value={when} onChange={(w) => { setError(null); setWhen(w); }} now={now} monthsAhead={monthsAhead} serverMessage={error} />
          <p className="mt-3 text-sm text-midnight">Changing the time keeps your reserved credit. Nothing extra is used.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={primary} onClick={save} disabled={busy || ev.status !== "ready"}>{busy ? "Saving…" : "Save new time"}</button>
            <button type="button" className={btn} onClick={() => { setMode("view"); setError(null); setWhen({ localDate: s.localDate, localTime: s.localTime, timeZone: s.timeZone }); }} disabled={busy}>Keep current time</button>
          </div>
        </div>
      )}
      {mode === "cancel" && editable && (
        <div role="alertdialog" aria-labelledby={`c-${s.id}`} className="mt-5 rounded-2xl bg-white p-4 ring-2 ring-lavender">
          <p id={`c-${s.id}`} className="font-semibold">Cancel this scheduled card?</p>
          <p className="mt-1 text-sm text-ink-soft">The card won&rsquo;t be delivered. Your reserved credit{s.card.premium ? "s are" : " is"} released if {s.card.premium ? "they are" : "it is"} still within the allowance period {s.card.premium ? "they" : "it"} came from.</p>
          {error && <p role="alert" className="mt-2 text-sm text-[#7a1738]">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={primary} onClick={cancelIt} disabled={busy}>{busy ? "Cancelling…" : "Yes, cancel it"}</button>
            <button type="button" className={btn} onClick={() => { setMode("view"); setError(null); }} disabled={busy}>Keep it</button>
          </div>
        </div>
      )}
      {mode === "view" && error && <p role="alert" className="mt-3 text-sm text-[#7a1738]">{error}</p>}
      {mode === "view" && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className={btn} onClick={onPreview}>Preview card</button>
          {editable && <button type="button" className={btn} onClick={() => { setError(null); setMode("edit"); }}>Edit schedule</button>}
          {editable && <button type="button" className={btn} onClick={() => { setError(null); setMode("cancel"); }}>Cancel schedule</button>}
        </div>
      )}
    </li>
  );
}

function PreviewDialog({ s, onClose }: { s: Schedule; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-midnight/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Preview of ${s.card.title}`} className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto aspect-[9/16] max-h-[78dvh] w-auto overflow-hidden rounded-[2.2rem] bg-midnight shadow-lift ring-8 ring-midnight" style={{ maxWidth: "min(100%, 22rem)" }}>
          <CardPlayer compact card={{ templateKey: s.card.templateKey as never, recipientName: s.card.recipientName, senderName: s.card.senderName, message: s.card.message, media: s.card.media ? { kind: "image", ...s.card.media } : null }} />
        </div>
        <div className="mt-4 text-center"><button ref={closeRef} type="button" onClick={onClose} className="rounded-full bg-ivory px-6 py-3 text-sm font-semibold text-midnight shadow-soft focus-visible:outline-offset-4">Close preview</button></div>
      </div>
    </div>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { /* the link is selectable text above */ }
  }
  return <button type="button" className={btn} onClick={copy}>{copied ? "Copied" : "Copy link"}</button>;
}
