"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import type { SceneProps } from "../../types";
import { autoAdvanceSeconds } from "../support";

/**
 * Gives an existing CSS scene the Mawica ending, so every standard card finishes the same way. Used for the snow globe (its premium pre-rendered
 * artwork stays) and for the 2D fallbacks of the other five. The scene's own message panel is left exactly as it was; the ending replaces the whole
 * view only after the recipient presses Continue (or, for a short message, after a reading time), and never redirects.
 */
export function withEnding(Scene: ComponentType<SceneProps>) {
  function WithEnding(props: SceneProps) {
    const reduced = usePrefersReducedMotion();
    const [ending, setEnding] = useState(false);
    const [ready, setReady] = useState(false);
    const { replayKey, message } = props;
    useEffect(() => {
      setEnding(false); setReady(reduced);
      const show = window.setTimeout(() => setReady(true), reduced ? 0 : 11000);
      const secs = autoAdvanceSeconds(message);
      const auto = secs === null || reduced ? 0 : window.setTimeout(() => setEnding(true), 11000 + secs * 1000);
      return () => { clearTimeout(show); if (auto) clearTimeout(auto); };
    }, [replayKey, reduced, message]);
    const toEnding = useCallback(() => setEnding(true), []);
    return (
      <div className="relative size-full">
        <Scene {...props} />
        {ready && !ending && <div className="pointer-events-none absolute inset-x-0 bottom-1 z-20 flex justify-center"><button type="button" onClick={toEnding} className="cin-pill pointer-events-auto text-[0.8rem]">Continue</button></div>}
        <div className={`cin-end ${ending ? "cin-end-on" : ""}`} aria-hidden={!ending} inert={!ending}>
          <div className="cin-end-inner">
            <p className="cin-wordmark">mawica.</p>
            <Link href="/" className="cin-url">www.mawica.com</Link>
            <p className="cin-send">Send your feelings to others.</p>
            <p className="cin-tag">BRING YOUR WISHES TO LIFE.</p>
            <div className="cin-end-actions">
              <Link href="/create" className="cin-pill cin-pill-primary">Create your own card</Link>
              <button type="button" onClick={() => setEnding(false)} className="cin-pill">Read again</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  WithEnding.displayName = `WithEnding(${Scene.displayName ?? Scene.name})`;
  return WithEnding;
}
