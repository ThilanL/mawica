"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { heroArtwork } from "@/content/hero";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import type { LumiControls, LumiStats } from "@/components/lumi/LumiCanvas";
import { webglAvailable } from "@/components/lumi/lumiMath";

// Three.js and react-three-fiber live in this chunk only; it is fetched when the lab page mounts.
const LumiCanvas = dynamic(() => import("@/components/lumi/LumiCanvas"), { ssr: false });

type Mode = "globe" | "closeup";

/** Catches runtime WebGL/context errors and shows the static fallback instead of a blank stage. */
class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** CSS-only static Lumi for no-WebGL: clearly a placeholder, still shows the character and label. */
function StaticLumi({ small }: { small?: boolean }) {
  return (
    <div role="img" aria-label="Lumi, a small golden star (static image: 3D is unavailable on this device)" className="absolute inset-0 grid place-items-center">
      <div className={`relative ${small ? "size-[18%]" : "size-[46%]"} aspect-square`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle,#ffd98a,#f6c453_60%,#e49a2b)] shadow-[0_0_40px_10px_rgb(255_190_90/0.5)]" style={{ clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" }} />
        <div className="absolute left-[38%] top-[38%] size-[6%] rounded-full bg-midnight" />
        <div className="absolute right-[38%] top-[38%] size-[6%] rounded-full bg-midnight" />
        <div className="absolute left-[43%] top-[50%] h-[5%] w-[14%] rounded-b-full border-b-2 border-[#8a2f62]" />
      </div>
    </div>
  );
}

const subscribeNone = () => () => {};
const stillSnapshot = () => new URLSearchParams(window.location.search).has("still");

export function LumiLab() {
  const reduced = usePrefersReducedMotion();
  const [mode, setMode] = useState<Mode>("globe");
  const [forceFallback, setForceFallback] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [stats, setStats] = useState<LumiStats | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const controls = useRef<LumiControls | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const webgl = useSyncExternalStore(subscribeNone, webglAvailable, () => true);
  const still = useSyncExternalStore(subscribeNone, stillSnapshot, () => false); // ?still=1: frozen pose, no glow (used to render the static preview image)
  const live = webgl && !forceFallback;

  // Pause rendering when the stage is off screen or the tab is hidden.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    const vis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [mode]);

  const celebrate = () => {
    controls.current?.celebrate();
    setCelebrating(true);
    window.setTimeout(() => setCelebrating(false), reduced ? 1300 : 2700);
  };

  const art = heroArtwork;
  const visible = (100 - art.crop.top - art.crop.bottom) / 100;
  // Where Lumi sits, as % of the full globe image, mapped into the cropped stage (-1..1 NDC).
  const anchor = mode === "globe" ? { x: (49.6 - 50) / 50, y: 1 - 2 * ((30.2 - art.crop.top) / (100 - art.crop.top - art.crop.bottom)) } : { x: 0, y: -0.06 };
  const size = mode === "globe" ? 0.062 : 0.25;
  const R = 0.227 * Math.sqrt((1 + (art.height / art.width) ** 2) / 2);
  const refLen = Math.sqrt((1 + (art.height * visible / art.width) ** 2) / 2);
  const clip = mode === "globe" ? `circle(${((R / refLen) * 100).toFixed(1)}% at 50.2% ${(((42 - art.crop.top) / (100 - art.crop.top - art.crop.bottom)) * 100).toFixed(1)}%)` : undefined;

  const stageBox = mode === "globe"
    ? { aspectRatio: `${art.width} / ${art.height * visible}`, maxWidth: "min(100%, 40rem)" }
    : { aspectRatio: "4 / 5", maxWidth: "min(100%, 30rem)" };

  return (
    <div className="min-h-dvh" style={{ background: "#2a1b3d", color: "#fff8f4" }}>
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">Mawica lab · internal prototype</p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl">Meet Lumi</h1>
        <p className="mt-3 max-w-2xl text-ivory/80">
          A procedural 3D test character (rounded star, eyes, smile) to judge motion and feel. It is a prototype built from code, not final character art. Move the pointer, tap Lumi, or use the button.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="View" className="flex rounded-full bg-white/10 p-1">
          {(["globe", "closeup"] as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === m ? "bg-ivory text-midnight" : "text-ivory/80"}`}>
              {m === "globe" ? "In the globe" : "Close-up"}
            </button>
          ))}
        </div>
        <button type="button" onClick={celebrate} disabled={!live} className="rounded-full bg-rose px-5 py-2.5 text-sm font-semibold text-midnight disabled:opacity-50">
          Make Lumi celebrate
        </button>
        <label className="flex items-center gap-2 text-sm text-ivory/80">
          <input type="checkbox" checked={forceFallback} onChange={(e) => setForceFallback(e.target.checked)} /> Test static fallback
        </label>
      </div>

      <div className="grid place-items-center">
        <div
          ref={stage}
          className={`relative w-full overflow-hidden ${mode === "closeup" ? "rounded-[2rem] bg-[radial-gradient(80%_70%_at_50%_40%,#4a2d6b,#2a1b3d_70%)] shadow-lift" : ""}`}
          style={stageBox}
        >
          {mode === "globe" && (
            <div className="absolute inset-x-0" style={{ top: `${-(art.crop.top / 100 / visible) * 100}%`, height: `${100 / visible}%` }}>
              <Image src={art.src} alt="" fill sizes="(min-width: 640px) 40rem, 92vw" priority className="object-contain" />
            </div>
          )}
          <div className="absolute inset-0" style={{ clipPath: clip }}>
            {live ? (
              <Boundary fallback={<StaticLumi small={mode === "globe"} />}>
                <LumiCanvas anchor={anchor} size={size} running={inView && tabVisible} reduced={reduced} controls={controls} onStats={setStats} still={still} />
              </Boundary>
            ) : (
              <StaticLumi small={mode === "globe"} />
            )}
          </div>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">{celebrating ? "Lumi is celebrating" : ""}</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-2xl bg-white/5 p-4 font-mono text-xs text-ivory/70 sm:grid-cols-4" aria-label="Render stats">
        <div><dt className="inline">mode </dt><dd className="inline">{live ? (reduced ? "WebGL, reduced motion" : "WebGL") : webgl ? "static (forced)" : "static (no WebGL)"}</dd></div>
        <div><dt className="inline">fps </dt><dd className="inline">{stats?.fps ?? "-"}</dd></div>
        <div><dt className="inline">draw calls </dt><dd className="inline">{stats?.calls ?? "-"}</dd></div>
        <div><dt className="inline">triangles </dt><dd className="inline">{stats?.triangles ?? "-"}</dd></div>
        <div><dt className="inline">dpr </dt><dd className="inline">{stats?.dpr ?? "-"}</dd></div>
        <div><dt className="inline">geometries </dt><dd className="inline">{stats?.geometries ?? "-"}</dd></div>
        <div><dt className="inline">textures </dt><dd className="inline">{stats?.textures ?? "-"}</dd></div>
        <div><dt className="inline">rendering </dt><dd className="inline">{inView && tabVisible ? "on" : "paused"}</dd></div>
      </dl>
    </main>
    </div>
  );
}
