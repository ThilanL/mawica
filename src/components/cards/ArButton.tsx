"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import type { ArHandle, ArState } from "./premium3d/ar/webxr";
import type { WishText } from "./premium3d/ar/wish";

const HINT: Partial<Record<ArState, string>> = {
  starting: "Starting AR…",
  scanning: "Move your phone slowly to find the floor",
  ready: "Tap the floor to place your gift",
};

/**
 * "View in AR" for the recipient (Phase AR-1b: Android WebXR). Shown only where the browser can start an AR session; everywhere else it renders
 * nothing and the card is exactly as before. The AR code (three.js scene, WebXR) is fetched only when the button is tapped. The personal wish is
 * drawn on the phone from text already on this page; nothing is uploaded or stored.
 */
export function ArButton({ wish }: { wish: WishText }) {
  const reduced = usePrefersReducedMotion();
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [state, setState] = useState<ArState | null>(null);
  const [clipped, setClipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const handle = useRef<ArHandle | null>(null);

  useEffect(() => {
    let live = true;
    navigator.xr?.isSessionSupported("immersive-ar").then((ok) => { if (live) setSupported(ok); }).catch(() => {});
    return () => { live = false; handle.current?.end(); };
  }, []);

  // Taps on the overlay's own controls must not also place the gift (WebXR fires "select" for them unless told not to).
  useEffect(() => {
    const el = overlay.current; if (!el) return;
    const stop = (e: Event) => { if ((e.target as Element).closest("button, a, [data-ar-ui]")) e.preventDefault(); };
    el.addEventListener("beforexrselect", stop);
    return () => el.removeEventListener("beforexrselect", stop);
  }, []);

  async function start() {
    setError(null); setClipped(false);
    flushSync(() => { setActive(true); setState("starting"); }); // the overlay root must be in the page before the session asks for it
    try {
      const { startGiftAR } = await import("./premium3d/ar/webxr");
      handle.current = await startGiftAR({
        wish, overlay: overlay.current!, reduced,
        onState: (s, info) => {
          if (info?.error) setError(info.error);
          if (info?.clipped !== undefined) setClipped(info.clipped);
          setState(s);
          if (s === "ended") { handle.current = null; setActive(false); }
        },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === "NotAllowedError" || name === "SecurityError" ? "AR needs your permission to use the camera. Tap View in AR to try again." : "AR couldn't start on this phone.");
      setState("error");
    }
  }

  if (!supported) return null;
  return (
    <>
      <button type="button" onClick={start} disabled={active && state !== "error"} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-ivory backdrop-blur ring-1 ring-white/25 hover:bg-white/25 disabled:opacity-60">
        View in AR
      </button>
      <div ref={overlay} data-ar-overlay className="ar-overlay" hidden={!active && state !== "error"} aria-live="polite">
        {state && HINT[state] && <p className="ar-hint">{HINT[state]}</p>}
        {error && <p className="ar-hint" role="alert">{error}</p>}
        <button type="button" className="ar-close" onClick={() => { if (handle.current) handle.current.end(); else { setActive(false); setState(null); setError(null); } }} aria-label="Close AR">Close</button>
        {state === "wish" && (
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
    </>
  );
}
