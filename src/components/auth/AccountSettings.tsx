"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";

/** Full page load on purpose: the session-aware header and every cached client state must start fresh after sign-out. */
const hardNavigate = (to: string) => { window.location.href = to; };
const subscribeNone = () => () => {};
const NO_ZONES: string[] = [];
let cachedZones: string[] | null = null;
const getNoZones = () => NO_ZONES;
function getBrowserZones(): string[] {
  if (cachedZones) return cachedZones;
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    cachedZones = here ? [...list, here] : list;
  } catch { cachedZones = NO_ZONES; }
  return cachedZones;
}

type Profile = { email: string; emailVerified: boolean; displayName: string | null; timeZone: string };

export function AccountSettings({ initial }: { initial: Profile }) {
  const [name, setName] = useState(initial.displayName ?? "");
  const [tz, setTz] = useState(initial.timeZone);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [leaving, setLeaving] = useState(false);

  // The zone list comes from the browser only (server snapshot is empty), so hydration never compares different lists.
  const browserZones = useSyncExternalStore(subscribeNone, getBrowserZones, getNoZones);
  const zones = useMemo(() => [...new Set(["UTC", initial.timeZone, ...browserZones])].sort(), [browserZones, initial.timeZone]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ displayName: name.trim() || null, timeZone: tz }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setMsg({ kind: "ok", text: "Saved." });
      else if (res.status === 401) hardNavigate("/sign-in?next=/account");
      else setMsg({ kind: "err", text: data.errors?.displayName ?? data.errors?.timeZone ?? data.error ?? "We couldn't save that. Please try again." });
    } catch { setMsg({ kind: "err", text: "You appear to be offline. Check your connection and try again." }); }
    setBusy(false);
  }

  async function signOut() {
    setLeaving(true);
    try { await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: "{}" }); } catch { /* fall through: the cookie may still be valid, the user can retry */ }
    hardNavigate("/");
  }

  const input = "mt-2 w-full rounded-2xl border border-midnight/15 bg-white px-4 py-3.5 text-base text-midnight transition focus:border-rose focus:outline-none";
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="acct-email" className="rounded-[1.75rem] bg-white/80 p-6 shadow-soft ring-1 ring-midnight/5 backdrop-blur sm:p-8">
        <h2 id="acct-email" className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-soft">Email</h2>
        <p className="mt-3 break-all text-lg font-medium">{initial.email}</p>
        <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-blush px-3 py-1 text-sm font-medium text-midnight">
          <span aria-hidden className="size-2 rounded-full bg-[#2e9e6b]" />{initial.emailVerified ? "Verified" : "Not verified"}
        </p>
      </section>

      <form onSubmit={save} className="rounded-[1.75rem] bg-white/80 p-6 shadow-soft ring-1 ring-midnight/5 backdrop-blur sm:p-8" aria-labelledby="acct-profile">
        <h2 id="acct-profile" className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-soft">Profile</h2>
        <div className="mt-5">
          <label htmlFor="displayName" className="text-sm font-semibold">Display name</label>
          <input id="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" placeholder="How should we greet you?" className={input} />
        </div>
        <div className="mt-5">
          <label htmlFor="timeZone" className="text-sm font-semibold">Time zone</label>
          <select id="timeZone" value={tz} onChange={(e) => setTz(e.target.value)} className={input} aria-describedby="tz-hint">
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
          <p id="tz-hint" className="mt-2 text-sm text-ink-soft">Used for dates and times when you schedule cards later.</p>
        </div>
        <div aria-live="polite" className="mt-4 min-h-6 text-sm">
          {msg && <p role={msg.kind === "err" ? "alert" : "status"} className={msg.kind === "ok" ? "font-medium text-[#1f7a52]" : "font-medium text-[#a1262d]"}>{msg.text}</p>}
        </div>
        <button type="submit" disabled={busy} className="mt-2 rounded-full bg-midnight px-7 py-3.5 text-base font-semibold text-ivory shadow-soft transition hover:bg-[#3d2a56] focus-visible:outline-offset-4 active:scale-[0.98] disabled:opacity-60">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>

      <section aria-labelledby="acct-session" className="rounded-[1.75rem] bg-white/80 p-6 shadow-soft ring-1 ring-midnight/5 backdrop-blur sm:p-8">
        <h2 id="acct-session" className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-soft">Session</h2>
        <p className="mt-3 text-ink-soft">You&rsquo;re signed in on this device. Signing out ends this session.</p>
        <button type="button" onClick={signOut} disabled={leaving} className="mt-5 rounded-full border border-midnight/20 bg-white/70 px-7 py-3.5 text-base font-semibold text-midnight transition hover:bg-white focus-visible:outline-offset-4 active:scale-[0.98] disabled:opacity-60">
          {leaving ? "Signing out…" : "Sign out"}
        </button>
      </section>
    </div>
  );
}
