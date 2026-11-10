"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";

type SessionInfo = { signedIn: boolean; initial?: string };

// One request shared by every instance on the page. Anonymous visitors are answered without a database query.
let pending: Promise<SessionInfo> | null = null;
const load = () => (pending ??= fetch("/api/account/session", { cache: "no-store", credentials: "same-origin" }).then((r) => (r.ok ? r.json() : { signedIn: false })).catch(() => ({ signedIn: false })));

/** Header slot: "Sign In" until the session check says otherwise. Deliberately tiny: no auth client library on public pages. */
export function AccountNav({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const [info, setInfo] = useState<SessionInfo>({ signedIn: false });
  useEffect(() => { let live = true; load().then((i) => live && setInfo(i)); return () => { live = false; }; }, []);

  if (info.signedIn) {
    return mobile ? (
      <ButtonLink href="/account" variant="secondary" onClick={onNavigate}>Your account</ButtonLink>
    ) : (
      <a href="/account" aria-label="Your account" className="grid size-10 place-items-center rounded-full bg-[linear-gradient(145deg,#3a2556,#2a1b3d)] text-sm font-semibold text-ivory shadow-soft ring-2 ring-white/70 transition hover:ring-rose focus-visible:outline-offset-4">
        {info.initial ?? "·"}
      </a>
    );
  }
  return mobile ? (
    <ButtonLink href="/sign-in" variant="secondary" onClick={onNavigate}>Sign In</ButtonLink>
  ) : (
    <ButtonLink href="/sign-in" variant="ghost" size="md">Sign In</ButtonLink>
  );
}
