"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CardArt } from "@/components/landing/CardArt";
import { Button } from "@/components/ui/Button";
import { LIMITS } from "@/modules/cards/schema";
import { hasTemporaryArtwork } from "@/content/artwork";
import { ALL_TEMPLATE_KEYS, getTemplate, isAnyTemplateKey, isPremiumTemplateKey, premiumTemplates, templates, type AnyTemplateKey, type TemplateKey } from "@/modules/templates/registry";

// Scheduling UI (time-zone engine + form) is only needed after "Schedule for later" is chosen: keep it out of the first /create bundle.
const SchedulePanel = dynamic(() => import("@/components/schedule/SchedulePanel").then((m) => m.SchedulePanel), {
  ssr: false,
  loading: () => <p role="status" className="mx-auto mt-8 max-w-md rounded-[1.5rem] bg-white/70 p-5 text-center text-ink-soft">Loading scheduling…</p>,
});

// Loaded on demand: the scene code is not part of the first /create bundle.
const CardPlayer = dynamic(() => import("@/components/cards/CardPlayer").then((m) => m.CardPlayer), {
  ssr: false,
  loading: () => <div className="grid size-full place-items-center bg-midnight text-ivory/70">Loading preview…</div>,
});

type Step = "choose" | "personalise" | "preview" | "published";
type Fields = { recipientName: string; senderName: string; message: string };
type Errors = Partial<Record<keyof Fields | "templateKey" | "form", string>>;

const STEPS: { id: Exclude<Step, "published">; label: string }[] = [
  { id: "choose", label: "Choose" },
  { id: "personalise", label: "Personalise" },
  { id: "preview", label: "Preview" },
];

/** What the wizard knows about the visitor's wallet. Display only: the server enforces everything on publish. */
type Member = { state: "unknown" } | { state: "guest" } | { state: "member"; cards: number; premium: number; monthsAhead: number };
const DRAFT_KEY = "mawica.draft";

const inputCls = "mt-2 block w-full rounded-2xl border border-midnight/25 bg-white px-4 py-3 text-base text-midnight shadow-sm placeholder:text-midnight/45";

export function CreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [templateKey, setTemplateKey] = useState<AnyTemplateKey>("snow-globe");
  const [fields, setFields] = useState<Fields>({ recipientName: "", senderName: "", message: templates["snow-globe"].defaultMessage });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState<{ slug: string; url: string; premiumRemaining?: number } | null>(null);
  const [member, setMember] = useState<Member>({ state: "unknown" });
  const [confirming, setConfirming] = useState(false);
  const [mode, setMode] = useState<"now" | "later">("now");
  const premium = isPremiumTemplateKey(templateKey);
  const honeypot = useRef<HTMLInputElement>(null);
  const idemKey = useRef<string | null>(null);

  // Switching template swaps in that template's default message only if the user has not edited the current one.
  function chooseTemplate(key: AnyTemplateKey) {
    setTemplateKey(key);
    setConfirming(false);
    setFields((f) => (f.message === getTemplate(templateKey).defaultMessage || !f.message.trim() ? { ...f, message: getTemplate(key).defaultMessage } : f));
  }

  // Wallet hints (display only). Anonymous visitors cost no database query; the session probe answers from the cookie header.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await (await fetch("/api/account/session", { cache: "no-store", credentials: "same-origin" })).json();
        if (!s.signedIn) return live && setMember({ state: "guest" });
        const w = await fetch("/api/wallet", { cache: "no-store", credentials: "same-origin" });
        if (!w.ok) return;
        const j = await w.json();
        if (live) setMember({ state: "member", cards: j.wallet.sends.remaining, premium: j.wallet.premium.remaining, monthsAhead: j.wallet.schedulingMonthsAhead ?? 1 });
      } catch { /* hints are optional: the server decides */ }
    })();
    return () => { live = false; };
  }, []);

  // After signing in from the premium preview, bring the draft back (kept only in this tab's sessionStorage, removed on read).
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        window.sessionStorage.removeItem(DRAFT_KEY);
        const d = JSON.parse(raw) as { templateKey?: string; fields?: Partial<Fields>; mode?: string };
        if (!d.templateKey || !isAnyTemplateKey(d.templateKey) || !d.fields) return;
        const f = d.fields;
        if ([f.recipientName, f.senderName, f.message].some((v) => typeof v !== "string")) return;
        setTemplateKey(d.templateKey);
        setFields({ recipientName: f.recipientName!.slice(0, LIMITS.name), senderName: f.senderName!.slice(0, LIMITS.name), message: f.message!.slice(0, LIMITS.message) });
        if (d.mode === "later") setMode("later");
        setStep("preview");
      } catch { /* storage unavailable or malformed: start fresh */ }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  function signInToPublish() {
    try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ templateKey, fields, mode })); } catch { /* the draft is a convenience only */ }
    router.push("/sign-in?next=/create");
  }

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  // Radio-group keyboard pattern: one tab stop, arrow keys move and select.
  function onRadioKeys(e: React.KeyboardEvent<HTMLDivElement>) {
    const keys = [...ALL_TEMPLATE_KEYS] as AnyTemplateKey[];
    const i = keys.indexOf(templateKey);
    const step = ["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = keys[(i + step + keys.length) % keys.length];
    chooseTemplate(next);
    requestAnimationFrame(() => e.currentTarget.querySelector<HTMLElement>(`[data-key="${next}"]`)?.focus());
  }

  function validateLocal(): Errors {
    const e: Errors = {};
    if (!fields.recipientName.trim()) e.recipientName = "Enter the recipient's name";
    if (!fields.senderName.trim()) e.senderName = "Enter your name";
    if (!fields.message.trim()) e.message = "Write a message";
    return e;
  }

  function toPreview(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validateLocal();
    setErrors(e);
    idemKey.current = null; // content may have changed: a new publish attempt gets a new key
    if (Object.keys(e).length === 0) setStep("preview");
  }

  async function publish() {
    setBusy(true);
    setErrors({});
    // One key per publish attempt, reused if the same attempt is retried, so a double click or a network retry can never make two cards.
    idemKey.current ??= crypto.randomUUID();
    setConfirming(false);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey.current },
        body: JSON.stringify({ templateKey, ...fields, website: honeypot.current?.value ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201 || res.status === 200) {
        idemKey.current = null;
        setPublished({ slug: data.slug, url: data.url, premiumRemaining: typeof data.premiumRemaining === "number" ? data.premiumRemaining : undefined });
        setStep("published");
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setStep("personalise");
      } else if (res.status === 401 && data.code === "SIGN_IN_REQUIRED") {
        setErrors({ form: "Sign in to publish a premium card. Your preview is still here." });
      } else if (res.status === 402 && data.code === "INSUFFICIENT_PREMIUM_CREDITS") {
        setErrors({ form: "You don't have a premium credit available, so this card wasn't published and nothing was used." });
      } else if (res.status === 402) {
        const when = data.resetsAt ? ` Your allowance renews on ${new Date(data.resetsAt).toLocaleDateString(undefined, { day: "numeric", month: "long" })}.` : "";
        setErrors({ form: `You've used all your cards for this month.${when}` });
      } else if (res.status === 422) {
        idemKey.current = null;
        setErrors({ form: "That card changed since you tried to publish it. Please press Publish again." });
      } else if (res.status === 429) {
        const mins = Math.ceil(Number(res.headers.get("Retry-After") ?? 60) / 60);
        setErrors({ form: `You've made a lot of cards. Please try again in about ${mins} minute${mins === 1 ? "" : "s"}.` });
      } else {
        setErrors({ form: "Something went wrong. Please try again." });
      }
    } catch {
      setErrors({ form: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  if (step === "published" && published) return <Published slug={published.slug} url={published.url} recipient={fields.recipientName} premiumRemaining={published.premiumRemaining} onAnother={() => { setPublished(null); setStep("choose"); setFields({ recipientName: "", senderName: fields.senderName, message: getTemplate(templateKey).defaultMessage }); }} />;

  const idx = STEPS.findIndex((s) => s.id === step);
  const errorSummary = Object.values(errors).filter(Boolean);

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-16">
      <ol className="mb-10 flex items-center justify-center gap-2 text-sm font-semibold" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.id} aria-current={i === idx ? "step" : undefined} className={`flex items-center gap-2 rounded-full px-4 py-2 ${i === idx ? "bg-midnight text-ivory" : i < idx ? "bg-blush text-midnight" : "text-ink-soft"}`}>
            <span aria-hidden>{i + 1}</span> {s.label}
          </li>
        ))}
      </ol>

      {errorSummary.length > 0 && (
        <div role="alert" className="mx-auto mb-6 max-w-xl rounded-2xl border border-[#a3254f]/30 bg-[#fdecf1] px-5 py-4 text-[#7a1738]">
          <ul className="list-inside list-disc">{errorSummary.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}

      {step === "choose" && (
        <section aria-labelledby="choose-h">
          <h1 id="choose-h" className="text-center font-display text-4xl sm:text-5xl">Choose your card</h1>
          <p className="mt-3 text-center text-ink-soft">Four Christmas cards and two for New Year.</p>
          <div role="radiogroup" aria-label="Card template" onKeyDown={onRadioKeys} className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(templates).map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={templateKey === t.key} tabIndex={templateKey === t.key ? 0 : -1} data-key={t.key} onClick={() => chooseTemplate(t.key)}
                className={`overflow-hidden rounded-[1.5rem] bg-white text-left shadow-soft ring-2 transition ${templateKey === t.key ? "ring-lavender" : "ring-transparent hover:ring-midnight/10"}`}>
                <CardArt theme={t.key} className="aspect-[16/10]" />
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#6c4fb5" }}>{t.occasion}</p>
                  <p className="mt-1 font-display text-xl">{t.title}</p>
                  <p className="mt-1 text-sm text-ink-soft">{t.description}</p>
                </div>
              </button>
            ))}
            <PremiumChoice selected={premium} onChoose={() => chooseTemplate("lumis-wish")} member={member} />
          </div>
          <div className="mt-10 flex justify-center"><Button onClick={() => setStep("personalise")}>{premium ? "Continue with Lumi's Wish" : "Continue"}</Button></div>
        </section>
      )}

      {step === "personalise" && (
        <form onSubmit={toPreview} noValidate className="mx-auto max-w-xl" aria-labelledby="pers-h">
          <h1 id="pers-h" className="text-center font-display text-4xl sm:text-5xl">Make it personal</h1>
          {premium && <p className="mx-auto mt-4 max-w-md rounded-2xl bg-[linear-gradient(135deg,#f7e6ef,#e9defb)] px-4 py-3 text-center text-sm text-midnight"><strong>Premium card.</strong> Previewing is free. Publishing uses 1 card and 1 premium credit from your wallet.</p>}
          <div className="mt-10 space-y-6">
            <Field label="Recipient's name" error={errors.recipientName} count={fields.recipientName.length} max={LIMITS.name}>
              {(p) => <input {...p} value={fields.recipientName} onChange={set("recipientName")} maxLength={LIMITS.name} autoComplete="off" placeholder="Ava" className={inputCls} />}
            </Field>
            <Field label="Your name" error={errors.senderName} count={fields.senderName.length} max={LIMITS.name}>
              {(p) => <input {...p} value={fields.senderName} onChange={set("senderName")} maxLength={LIMITS.name} autoComplete="given-name" placeholder="Sam" className={inputCls} />}
            </Field>
            <Field label="Your message" error={errors.message} count={fields.message.length} max={LIMITS.message}>
              {(p) => <textarea {...p} value={fields.message} onChange={set("message")} maxLength={LIMITS.message} rows={6} className={inputCls} />}
            </Field>
            <div aria-hidden className="absolute -left-[9999px]"><label>Website<input ref={honeypot} tabIndex={-1} autoComplete="off" name="website" /></label></div>
          </div>
          <div className="mt-10 flex justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep("choose")}>Back</Button>
            <Button type="submit">Preview card</Button>
          </div>
        </form>
      )}

      {step === "preview" && (
        <section aria-labelledby="prev-h" className="text-center">
          <h1 id="prev-h" className="font-display text-4xl sm:text-5xl">Preview your card</h1>
          <p className="mt-3 text-ink-soft">This is what {fields.recipientName} will see.</p>
          {!premium && hasTemporaryArtwork(templateKey as TemplateKey) && <p className="mt-1 text-sm text-ink-soft/80">Illustration is temporary while final artwork is produced.</p>}
          <div className="mx-auto mt-8 aspect-[9/16] max-h-[70dvh] w-auto overflow-hidden rounded-[2.2rem] bg-midnight shadow-lift ring-8 ring-midnight" style={{ maxWidth: "min(100%, 24rem)" }}>
            <CardPlayer compact card={{ templateKey, ...fields }} />
          </div>
          <DeliveryChoice mode={mode} onChange={(m) => { setConfirming(false); setMode(m); }} />
          {mode === "later" ? (
            member.state === "member" ? (
              <SchedulePanel card={{ templateKey, ...fields }} premium={premium} cards={member.cards} premiumCredits={member.premium} monthsAhead={member.monthsAhead} onEditCard={() => setStep("personalise")} />
            ) : (
              <div className="mx-auto mt-8 max-w-md rounded-[1.5rem] bg-[linear-gradient(135deg,#f7e6ef,#e9defb)] p-5 text-left ring-1 ring-midnight/5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: ink }}>Schedule for later</p>
                <p className="mt-2 text-midnight">{member.state === "unknown" ? "Checking your account…" : <>Scheduling needs an account, so we can keep your card private until it&rsquo;s delivered. Scheduling reserves <strong>1 card</strong>{premium && <> and <strong>1 premium credit</strong></>}.</>}</p>
                {member.state === "guest" && <div className="mt-4 flex flex-wrap gap-3"><Button onClick={signInToPublish}>Sign in to schedule</Button><Button variant="secondary" onClick={() => setStep("personalise")}>Edit</Button></div>}
              </div>
            )
          ) : premium ? (
            <PremiumPublish member={member} busy={busy} confirming={confirming} recipient={fields.recipientName} onEdit={() => { setConfirming(false); setStep("personalise"); }} onAsk={() => setConfirming(true)} onCancel={() => setConfirming(false)} onPublish={publish} onSignIn={signInToPublish} />
          ) : (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => setStep("personalise")} disabled={busy}>Edit</Button>
              <Button onClick={publish} disabled={busy}>{busy ? "Publishing…" : "Publish & get link"}</Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Field({ label, error, count, max, children }: { label: string; error?: string; count: number; max: number; children: (p: { id: string; "aria-invalid": boolean; "aria-describedby": string }) => React.ReactNode }) {
  const id = `f-${label.replace(/\W+/g, "").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": `${id}-d` })}
      <p id={`${id}-d`} className="mt-1.5 flex justify-between text-sm">
        <span className="text-[#a3254f]">{error}</span>
        <span className={count >= max ? "text-[#a3254f]" : "text-ink-soft"}>{count}/{max}</span>
      </p>
    </div>
  );
}

function Published({ slug, url, recipient, premiumRemaining, onAnother }: { slug: string; url: string; recipient: string; premiumRemaining?: number; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const wa = `https://wa.me/?text=${encodeURIComponent(`I made you a magical card on mawica. ${url}`)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.getElementById("card-url") as HTMLInputElement | null;
      el?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-12 text-center sm:px-8 lg:py-16">
      <h1 className="font-display text-4xl sm:text-5xl">Your card is ready</h1>
      <p className="mt-3 text-ink-soft">Share it with {recipient} however you like.</p>
      {premiumRemaining !== undefined && <p role="status" className="mx-auto mt-4 w-fit rounded-full bg-blush px-4 py-2 text-sm font-medium text-midnight">Premium credits left: {premiumRemaining}. <Link href="/account/wallet" className="underline underline-offset-4">View wallet</Link></p>}
      <div className="mt-8 flex gap-2">
        <label htmlFor="card-url" className="sr-only">Card link</label>
        <input id="card-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} mt-0 min-w-0 flex-1`} />
        <Button onClick={copy} size="md">{copied ? "Copied" : "Copy link"}</Button>
      </div>
      <p role="status" className="sr-only">{copied ? "Link copied to clipboard" : ""}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-full bg-[#1a7f4b] px-7 py-3.5 font-semibold text-white hover:bg-[#156a3f]">Share on WhatsApp</a>
        <Link href={`/c/${slug}`} className="inline-flex items-center justify-center rounded-full border border-midnight/20 bg-white/60 px-7 py-3.5 font-semibold hover:bg-white">View card</Link>
      </div>
      <div className="mx-auto mt-10 w-fit rounded-3xl bg-white p-4 shadow-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/c/${slug}/qr.png`} alt={`QR code that opens the card for ${recipient}`} width={220} height={220} className="size-[220px]" />
      </div>
      <a href={`/c/${slug}/qr.png?download=1`} download className="mt-4 inline-block font-semibold underline underline-offset-4">Download QR code</a>
      <div className="mt-10"><Button variant="ghost" onClick={onAnother}>Make another card</Button></div>
    </div>
  );
}

const ink = "#6c4fb5";

function PremiumChoice({ selected, onChoose, member }: { selected: boolean; onChoose: () => void; member: Member }) {
  const t = premiumTemplates["lumis-wish"];
  const note =
    member.state === "member"
      ? member.premium > 0 ? `You have ${member.premium} premium credit${member.premium === 1 ? "" : "s"}.` : "You have no premium credits left. You can still preview it."
      : member.state === "guest" ? "Sign in to publish. Previewing is free." : "Sign in to publish. Previewing is free.";
  return (
    <button type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} data-key="lumis-wish" onClick={onChoose}
      className={`group relative overflow-hidden rounded-[1.5rem] bg-[linear-gradient(135deg,#3a2556,#2a1b3d_60%,#22152f)] text-left text-ivory shadow-lift ring-2 transition sm:col-span-2 lg:col-span-3 ${selected ? "ring-gold" : "ring-transparent hover:ring-white/30"}`}>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-lavender/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 left-10 size-48 rounded-full bg-rose/25 blur-3xl" />
      <div className="relative flex flex-col items-center gap-5 p-6 sm:flex-row sm:p-8">
        <div className="relative size-36 shrink-0 sm:size-40"><Image src="/art/lumi/lumi-awake.webp" alt="" fill sizes="160px" className="object-contain drop-shadow-[0_10px_24px_rgba(244,195,113,0.45)]" /></div>
        <div className="text-center sm:text-left">
          <p className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold ring-1 ring-gold/40"><span aria-hidden>★</span> Premium · {t.occasion}</p>
          <p className="mt-3 font-display text-3xl">{t.title}</p>
          <p className="mt-2 max-w-md text-ivory/85">{t.description}</p>
          <p className="mt-3 text-sm text-ivory/75">Publishing uses 1 card and 1 premium credit. {note}</p>
        </div>
      </div>
    </button>
  );
}

function PremiumPublish({ member, busy, confirming, recipient, onEdit, onAsk, onCancel, onPublish, onSignIn }: { member: Member; busy: boolean; confirming: boolean; recipient: string; onEdit: () => void; onAsk: () => void; onCancel: () => void; onPublish: () => void; onSignIn: () => void }) {
  const none = member.state === "member" && (member.premium < 1 || member.cards < 1);
  return (
    <div id="premium-publish" className="mx-auto mt-8 max-w-md">
      <div className="rounded-[1.5rem] bg-[linear-gradient(135deg,#f7e6ef,#e9defb)] p-5 text-left ring-1 ring-midnight/5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: ink }}>Premium card</p>
        {member.state === "member" ? (
          <p className="mt-2 text-midnight">
            {none
              ? member.premium < 1 ? "You have no premium credits left, so this card can't be published. Your preview is free." : "You've used all your cards for this month, so this card can't be published yet."
              : <>Publishing uses <strong>1 card</strong> and <strong>1 premium credit</strong>. You&rsquo;ll have {member.premium - 1} premium credit{member.premium - 1 === 1 ? "" : "s"} and {member.cards - 1} card{member.cards - 1 === 1 ? "" : "s"} left this month.</>}
          </p>
        ) : (
          <p className="mt-2 text-midnight">Sign in to publish this premium card. Publishing uses <strong>1 card</strong> and <strong>1 premium credit</strong>; every new account gets one premium credit as a welcome gift.</p>
        )}
      </div>
      {confirming && (
        <div role="alertdialog" aria-labelledby="pc-title" className="mt-4 rounded-[1.5rem] bg-white p-5 text-left shadow-soft ring-2 ring-lavender">
          <p id="pc-title" className="font-semibold">Publish Lumi&rsquo;s Wish for {recipient}?</p>
          <p className="mt-1 text-sm text-ink-soft">This uses 1 card and 1 premium credit and can&rsquo;t be undone.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={onPublish} disabled={busy}>{busy ? "Publishing…" : "Confirm and publish"}</Button>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>Not yet</Button>
          </div>
        </div>
      )}
      {!confirming && (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="secondary" onClick={onEdit} disabled={busy}>Edit</Button>
          {member.state === "member" ? (
            <Button onClick={onAsk} disabled={busy || none}>{none ? "No premium credit available" : "Publish with 1 premium credit"}</Button>
          ) : (
            <Button onClick={onSignIn}>Sign in to publish</Button>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryChoice({ mode, onChange }: { mode: "now" | "later"; onChange: (m: "now" | "later") => void }) {
  const opt = (m: "now" | "later", label: string) => (
    <button type="button" role="radio" aria-checked={mode === m} onClick={() => onChange(m)}
      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${mode === m ? "bg-midnight text-ivory shadow-soft" : "text-midnight/80 hover:bg-white"}`}>{label}</button>
  );
  return (
    <div role="radiogroup" aria-label="When to send" className="mx-auto mt-8 flex w-fit gap-1 rounded-full bg-white/70 p-1 ring-1 ring-midnight/10">
      {opt("now", "Send now")}
      {opt("later", "Schedule for later")}
    </div>
  );
}
