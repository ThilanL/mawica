"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Step = "email" | "code";

const CODE_ERRORS: Record<string, string> = {
  INVALID_OTP: "That code isn't right. Check it and try again.",
  OTP_EXPIRED: "That code has expired. Request a new one.",
  TOO_MANY_ATTEMPTS: "Too many wrong attempts. Please request a new code.",
};

/** Only same-site relative paths are honoured after sign-in (no open redirect). */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/account";
  return raw;
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  let data: { code?: string; message?: string; error?: string } = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { res, data };
}

const field =
  "w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3.5 text-lg text-ivory placeholder:text-ivory/40 transition focus:border-rose focus:bg-white/15 focus:outline-none";

export function SignInForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { (step === "email" ? emailRef : codeRef).current?.focus(); }, [step]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      const { res, data } = await post("/api/auth/email-otp/send-verification-otp", { email: email.trim(), type: "sign-in" });
      if (res.status === 429) setError("Too many requests. Please wait a minute and try again.");
      else if (res.status === 400) setError(data.error ?? "Enter a valid email address.");
      else if (!res.ok) setError("We couldn't send a code right now. Please try again shortly.");
      else { setStep("code"); setCode(""); setCooldown(30); setNotice(`We sent a 6-digit code to ${email.trim().toLowerCase()}.`); }
    } catch { setError("You appear to be offline. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from your email."); return; }
    setError(""); setBusy(true);
    try {
      const { res, data } = await post("/api/auth/sign-in/email-otp", { email: email.trim(), otp: code });
      if (res.ok) { window.location.href = safeNext(new URLSearchParams(window.location.search).get("next")); return; }
      if (res.status === 429) setError("Too many attempts. Please wait a minute and try again.");
      else setError(CODE_ERRORS[data.code ?? ""] ?? "That code didn't work. Request a new one and try again.");
    } catch { setError("You appear to be offline. Check your connection and try again."); }
    setBusy(false);
  }

  return (
    <div className="rounded-[2rem] bg-[linear-gradient(160deg,#3a2556,#2a1b3d_60%,#22152f)] p-6 text-ivory shadow-lift ring-1 ring-white/10 sm:p-8">
      {step === "email" ? (
        <form onSubmit={sendCode} noValidate className="flex flex-col gap-5">
          <div>
            <label htmlFor="email" className="text-sm font-semibold text-ivory/90">Email address</label>
            <input ref={emailRef} id="email" name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-describedby="email-hint" aria-invalid={!!error} className={`${field} mt-2`} />
            <p id="email-hint" className="mt-2 text-sm text-ivory/70">We&rsquo;ll email you a one-time code. No password to remember.</p>
          </div>
          <Status error={error} notice="" />
          <button type="submit" disabled={busy || !email.trim()} className="rounded-full bg-ivory px-7 py-4 text-base font-semibold text-midnight transition hover:bg-white focus-visible:outline-offset-4 active:scale-[0.98] disabled:opacity-60">
            {busy ? "Sending…" : "Send me a code"}
          </button>
          <p className="text-center text-xs leading-relaxed text-ivory/70">
            By continuing you agree to the <Link href="/terms" className="underline underline-offset-4">Terms</Link> and acknowledge the <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
          </p>
        </form>
      ) : (
        <form onSubmit={verify} noValidate className="flex flex-col gap-5">
          <div>
            <label htmlFor="code" className="text-sm font-semibold text-ivory/90">6-digit code</label>
            <input ref={codeRef} id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" aria-describedby="code-hint" aria-invalid={!!error} className={`${field} mt-2 text-center font-mono text-3xl tracking-[0.5em]`} />
            <p id="code-hint" className="mt-2 text-sm text-ivory/70">Confirming this code verifies your email and creates your account if you&rsquo;re new. It expires in 5 minutes.</p>
            {process.env.NODE_ENV !== "production" && <p className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-ivory/80">Local development: the code is written to <code>.local-mail/outbox.jsonl</code>. No email is sent.</p>}
          </div>
          <Status error={error} notice={notice} />
          <button type="submit" disabled={busy || code.length !== 6} className="rounded-full bg-ivory px-7 py-4 text-base font-semibold text-midnight transition hover:bg-white focus-visible:outline-offset-4 active:scale-[0.98] disabled:opacity-60">
            {busy ? "Checking…" : "Verify and continue"}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <button type="button" onClick={() => { setStep("email"); setError(""); setNotice(""); }} className="text-ivory/80 underline underline-offset-4 hover:text-ivory">Use a different email</button>
            <button type="button" disabled={cooldown > 0 || busy} onClick={() => sendCode()} className="text-ivory/80 underline underline-offset-4 hover:text-ivory disabled:no-underline disabled:opacity-60">
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Status({ error, notice }: { error: string; notice: string }) {
  return (
    <div aria-live="polite" className="min-h-0">
      {error ? <p role="alert" className="rounded-2xl bg-[#5a1f45]/70 px-4 py-3 text-sm text-[#ffd6ea]">{error}</p> : notice ? <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-ivory/90">{notice}</p> : null}
    </div>
  );
}
