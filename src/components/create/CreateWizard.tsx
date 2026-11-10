"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CardArt } from "@/components/landing/CardArt";
import { Button } from "@/components/ui/Button";
import { LIMITS } from "@/modules/cards/schema";
import { hasTemporaryArtwork } from "@/content/artwork";
import { templates, type TemplateKey } from "@/modules/templates/registry";

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

const inputCls = "mt-2 block w-full rounded-2xl border border-midnight/25 bg-white px-4 py-3 text-base text-midnight shadow-sm placeholder:text-midnight/45";

export function CreateWizard() {
  const [step, setStep] = useState<Step>("choose");
  const [templateKey, setTemplateKey] = useState<TemplateKey>("snow-globe");
  const [fields, setFields] = useState<Fields>({ recipientName: "", senderName: "", message: templates["snow-globe"].defaultMessage });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState<{ slug: string; url: string } | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const idemKey = useRef<string | null>(null);

  // Switching template swaps in that template's default message only if the user has not edited the current one.
  function chooseTemplate(key: TemplateKey) {
    setTemplateKey(key);
    setFields((f) => (f.message === templates[templateKey].defaultMessage || !f.message.trim() ? { ...f, message: templates[key].defaultMessage } : f));
  }

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  // Radio-group keyboard pattern: one tab stop, arrow keys move and select.
  function onRadioKeys(e: React.KeyboardEvent<HTMLDivElement>) {
    const keys = Object.keys(templates) as TemplateKey[];
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
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey.current },
        body: JSON.stringify({ templateKey, ...fields, website: honeypot.current?.value ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201 || res.status === 200) {
        idemKey.current = null;
        setPublished({ slug: data.slug, url: data.url });
        setStep("published");
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setStep("personalise");
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

  if (step === "published" && published) return <Published slug={published.slug} url={published.url} recipient={fields.recipientName} onAnother={() => { setPublished(null); setStep("choose"); setFields({ recipientName: "", senderName: fields.senderName, message: templates[templateKey].defaultMessage }); }} />;

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
          </div>
          <div className="mt-10 flex justify-center"><Button onClick={() => setStep("personalise")}>Continue</Button></div>
        </section>
      )}

      {step === "personalise" && (
        <form onSubmit={toPreview} noValidate className="mx-auto max-w-xl" aria-labelledby="pers-h">
          <h1 id="pers-h" className="text-center font-display text-4xl sm:text-5xl">Make it personal</h1>
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
          {hasTemporaryArtwork(templateKey) && <p className="mt-1 text-sm text-ink-soft/80">Illustration is temporary while final artwork is produced.</p>}
          <div className="mx-auto mt-8 aspect-[9/16] max-h-[70dvh] w-auto overflow-hidden rounded-[2.2rem] bg-midnight shadow-lift ring-8 ring-midnight" style={{ maxWidth: "min(100%, 24rem)" }}>
            <CardPlayer compact card={{ templateKey, ...fields }} />
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button variant="secondary" onClick={() => setStep("personalise")} disabled={busy}>Edit</Button>
            <Button onClick={publish} disabled={busy}>{busy ? "Publishing…" : "Publish & get link"}</Button>
          </div>
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

function Published({ slug, url, recipient, onAnother }: { slug: string; url: string; recipient: string; onAnother: () => void }) {
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
