"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import { chooseArRoute, chromeIntent, inAppBrowser, isAndroid, type ArRoute } from "./arSupport";
import type { ArHandle, ArState } from "./premium3d/ar/webxr";
import type { WishText } from "./premium3d/ar/wish";

type UiState = ArState | "preparing";
const HINT: Partial<Record<UiState, string>> = {
  preparing: "Preparing your gift…",
  starting: "Starting AR…",
  scanning: "Move your phone slowly to find the floor",
  ready: "Tap the floor to place your gift",
  wish: "Tap the card to read it big",
};

/**
 * "View in AR" for the recipient. Android Chrome with ARCore: a live WebXR session (AR-1b). iPhone: AR Quick Look with a USDZ built on the phone
 * (AR-1c). A computer gets the card's QR code to open it on a phone, and a phone's in-app browser (Instagram, Facebook…) gets "open in Safari /
 * Chrome" help (AR-1d). Any other phone or tablet gets no button, and the card is exactly as before. The AR code is fetched only when the button
 * is tapped. The personal wish is built on the phone from text already on this page; nothing is uploaded or stored.
 */
export function ArButton({ wish, slug }: { wish: WishText; slug: string }) {
  const reduced = usePrefersReducedMotion();
  const [mode, setMode] = useState<ArRoute>(null);
  const [help, setHelp] = useState<"desktop" | "in-app" | null>(null);
  const [copied, setCopied] = useState(false);
  /** The big card: the whole wish, full screen. iPhone: from the Quick Look banner. Android: tap the card in AR (it shows over the camera). */
  const [reader, setReader] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [state, setState] = useState<UiState | null>(null);
  const [clipped, setClipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const handle = useRef<ArHandle | null>(null);
  const quick = useRef<{ url: string; link: HTMLAnchorElement | null } | null>(null);
  const dropQuick = () => { if (quick.current) { URL.revokeObjectURL(quick.current.url); quick.current.link?.remove(); quick.current = null; } };

  useEffect(() => {
    let live = true;
    const quickLook = () => { try { return document.createElement("a").relList.supports("ar"); } catch { return false; } };
    (navigator.xr ? navigator.xr.isSessionSupported("immersive-ar").catch(() => false) : Promise.resolve(false))
      .then((xr) => { if (live) setMode(chooseArRoute({ webxr: xr, quickLook: quickLook(), ua: navigator.userAgent, touchPoints: navigator.maxTouchPoints })); });
    return () => { live = false; handle.current?.end(); dropQuick(); };
  }, []);

  // Taps on the overlay's own controls must not also place the gift (WebXR fires "select" for them unless told not to).
  useEffect(() => {
    const el = overlay.current; if (!el) return;
    const stop = (e: Event) => { if ((e.target as Element).closest("button, a, [data-ar-ui]")) e.preventDefault(); };
    el.addEventListener("beforexrselect", stop);
    return () => el.removeEventListener("beforexrselect", stop);
  }, []);

  /** iPhone: build the personal USDZ here, then hand it to Quick Look. Its banner button ("Create your own") reports back to the link. */
  async function startQuickLook() {
    setError(null); dropQuick();
    flushSync(() => { setActive(true); setState("preparing"); });
    try {
      const { exportGiftUSDZ, openQuickLook, QL_BANNER_TAPPED } = await import("./premium3d/ar/quicklook");
      const { blob } = await exportGiftUSDZ(wish, { reduced });
      const url = URL.createObjectURL(blob); // in this tab's memory only; revoked on the next view or when the page closes
      const link = openQuickLook(url);
      link.addEventListener("message", (e) => { if ((e as MessageEvent).data === QL_BANNER_TAPPED) setReader(true); }); // banner "Read your card": Quick Look closes, the big card opens
      quick.current = { url, link };
      setActive(false); setState(null);
    } catch {
      setError("AR couldn't open on this iPhone."); setState("error");
    }
  }

  // The help dialog: focus moves into it, Escape closes it.
  useEffect(() => {
    if (!help) return;
    helpRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setHelp(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [help]);

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setCopied(false); }
  }

  async function start() {
    if (mode === "desktop" || mode === "in-app") { setCopied(false); setHelp(mode); return; }
    if (mode === "quicklook") return startQuickLook();
    setError(null); setClipped(false);
    flushSync(() => { setActive(true); setState("starting"); }); // the overlay root must be in the page before the session asks for it
    try {
      const { startGiftAR } = await import("./premium3d/ar/webxr");
      handle.current = await startGiftAR({
        wish, overlay: overlay.current!, reduced,
        onState: (s, info) => {
          if (s === "card") { setReader(true); return; }
          if (info?.error) setError(info.error);
          if (info?.clipped !== undefined) setClipped(info.clipped);
          setState(s);
          if (s === "ended") { handle.current = null; setActive(false); setReader(false); }
        },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === "NotAllowedError" || name === "SecurityError" ? "AR needs your permission to use the camera. Tap View in AR to try again." : "AR couldn't start on this phone.");
      setState("error");
    }
  }

  if (!mode) return null;
  return (
    <>
      <button type="button" onClick={start} disabled={active && state !== "error"} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-ivory backdrop-blur ring-1 ring-white/25 hover:bg-white/25 disabled:opacity-60">
        View in AR
      </button>
      <div ref={overlay} data-ar-overlay className="ar-overlay" hidden={!active && state !== "error" && !reader} aria-live="polite">
        {state && HINT[state] && <p className="ar-hint">{HINT[state]}</p>}
        {error && <p className="ar-hint" role="alert">{error}</p>}
        <button type="button" className="ar-close" onClick={() => { if (handle.current) handle.current.end(); else { setActive(false); setState(null); setError(null); } }} aria-label="Close AR">Close</button>
        {reader && (
          <div className="ar-reader" data-ar-ui role="dialog" aria-modal="true" aria-label={`Card for ${wish.name}`}>
            <article className="ar-reader-card">
              <p className="ar-reader-for">For {wish.name}</p>
              <h2 className="ar-reader-greeting">{wish.greeting}</h2>
              <div className="ar-reader-rule" aria-hidden />
              <div className="ar-reader-message" tabIndex={0}><p>{wish.message}</p></div>
              <p className="ar-reader-from">With love, {wish.sender}</p>
              <p className="ar-reader-mark">mawica.</p>
            </article>
            <div className="ar-reader-actions">
              <button type="button" className="cin-pill" onClick={() => setReader(false)}>{active ? "Back to AR" : "Close"}</button>
              <Link href="/create" className="cin-pill cin-pill-primary">Create your own card</Link>
            </div>
          </div>
        )}
        {state === "wish" && !reader && (
          <section className="ar-sheet" data-ar-ui aria-label="Your greeting">
            <p className="ar-for">For {wish.name}</p>
            <h2 className="ar-greeting">{wish.greeting}</h2>
            <div className="ar-message" tabIndex={0}><p>{wish.message}</p></div>
            <p className="ar-from">With love, {wish.sender}</p>
            {clipped && <p className="ar-note">The full message is shown here.</p>}
            <div className="ar-end">
              <p className="ar-wordmark">mawica.</p>
              <p className="ar-tag">Send your feelings to others.</p>
              <Link href="/create" className="cin-pill cin-pill-primary">Create your own card</Link>
            </div>
          </section>
        )}
      </div>
      {help && (
        <div className="ar-dialog-wrap" onClick={(e) => { if (e.target === e.currentTarget) setHelp(null); }}>
          <div ref={helpRef} role="dialog" aria-modal="true" aria-labelledby="ar-help-title" className="ar-dialog">
            {help === "desktop" ? (
              <>
                <h2 id="ar-help-title" className="ar-dialog-title">See this gift in your room</h2>
                <p className="ar-dialog-text">Scan the code with an iPhone or an Android phone, then tap <strong>View in AR</strong>.</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated per card by our own QR route; loaded only when this dialog opens */}
                <img src={`/c/${slug}/qr.png`} alt="QR code that opens this card" width={200} height={200} className="ar-qr" />
                <p className="ar-dialog-small">AR works in Safari on iPhone and in Chrome on most Android phones.</p>
              </>
            ) : (
              <>
                <h2 id="ar-help-title" className="ar-dialog-title">Open in your browser for AR</h2>
                <p className="ar-dialog-text">{inAppBrowser(navigator.userAgent) === "an app" ? "This app's" : `${inAppBrowser(navigator.userAgent)}'s`} built-in browser can&apos;t show AR. Open this card in {isAndroid(navigator.userAgent) ? "Chrome" : "Safari"} and tap <strong>View in AR</strong> there.</p>
                {isAndroid(navigator.userAgent) && <a href={chromeIntent(window.location.href)} className="cin-pill cin-pill-primary">Open in Chrome</a>}
                <button type="button" onClick={copyLink} className="cin-pill">{copied ? "Link copied" : "Copy link"}</button>
                {!isAndroid(navigator.userAgent) && <p className="ar-dialog-small">Or use the app&apos;s menu (••• or the share icon) and choose <strong>Open in Safari</strong>.</p>}
              </>
            )}
            <button type="button" onClick={() => setHelp(null)} className="ar-dialog-close">Close</button>
          </div>
        </div>
      )}
    </>
  );
}
