"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import { LumisWishScene } from "../scenes/LumisWishScene";
import type { SceneProps } from "../types";
import type { CanvasStats, CinemaEvents } from "./CinematicCanvas";
import { newShared, type Shared } from "./rig";
import { autoAdvanceSeconds, chooseRenderer, probeWebGL } from "./support";
import { T, pageRect } from "./timeline";

// three.js and react-three-fiber live only in this lazy chunk; nothing on the homepage imports it.
const CinematicCanvas = dynamic(() => import("./CinematicCanvas"), { ssr: false });

type Stage = "intro" | "reading" | "ending";

/** If the 3D canvas throws while running (shader failure, driver bug) we fall back to the 2D scene instead of leaving a blank card. */
import { Component, type ReactNode } from "react";
class CanvasBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Lumi's Wish: Cinematic. A real 3D scene (perspective camera, physically based materials, soft lighting, layered storm particles, a
 * thick envelope and a thick card) with the personalised greeting set as real DOM text on the 3D paper, so it is sharp, selectable,
 * scrollable and accessible. The recipient is never rushed: the reading stage waits for them (short messages move on by themselves,
 * longer ones wait for Continue). Falls back to the 2D Lumi's Wish when WebGL is unavailable, and shows the finished card straight away
 * under reduced motion.
 */
export function CinematicScene(props: SceneProps) {
  const { recipientName, senderName, message, greeting, replayKey, compact = false, media = null } = props;
  const reduced = usePrefersReducedMotion();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [lost, setLost] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lowPerf, setLowPerf] = useState(false);
  const [visible, setVisible] = useState(true);
  const [stage, setStage] = useState<Stage>("reading"); // server render: the finished, readable card
  const [size, setSize] = useState({ w: 390, h: 640 });
  const [dev, setDev] = useState<{ t?: number; renderer?: string; stage?: string; perf: boolean; noGuard: boolean }>({ perf: false, noGuard: false });
  const root = useRef<HTMLDivElement>(null);
  const shared = useRef<Shared>(newShared());
  const events = useRef<CinemaEvents>({});
  const autoCancelled = useRef(false);
  const [stats, setStats] = useState<CanvasStats | null>(null);

  // WebGL probe + dev/test switches (seek and forced renderer are ignored in production builds).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = { t: !IS_PROD && q.get("cinemaT") ? Number(q.get("cinemaT")) : undefined, renderer: !IS_PROD ? q.get("renderer") ?? undefined : undefined, stage: !IS_PROD ? q.get("stage") ?? undefined : undefined, perf: !IS_PROD || q.has("perf"), noGuard: q.has("noperfguard") }; // noperfguard: test harnesses on software WebGL keep the 3D scene instead of falling back to 2D
    setDev(d); // eslint-disable-line react-hooks/set-state-in-effect -- one-time read of the URL on the client
    setWebgl(d.renderer === "fallback" ? false : probeWebGL());
  }, []);

  const choice = webgl === null ? "pending" : chooseRenderer({ webgl, reducedMotion: reduced, contextLost: lost, failed: failed || lowPerf });
  const mode = choice === "webgl" ? "play" : "static";

  // (Re)start on replay.
  useEffect(() => {
    if (choice === "pending" || choice === "fallback-2d") return;
    autoCancelled.current = false;
    const s = shared.current;
    s.t = 0; s.playing = true; s.celebrateAt = -100;
    if (choice === "webgl-static") { s.t = T.end; setStage("reading"); return; } // eslint-disable-line react-hooks/set-state-in-effect -- stage follows the renderer choice
    if (dev.t !== undefined && Number.isFinite(dev.t)) { s.t = dev.t; s.playing = false; setStage(dev.stage === "ending" ? "ending" : dev.t >= T.end ? "reading" : "intro"); return; }
    setStage("intro");
  }, [choice, replayKey, dev.t, dev.stage]);

  useEffect(() => {
    events.current = {
      onDone: () => setStage((st) => (st === "intro" ? "reading" : st)),
      onLost: () => setLost(true),
      onLowPerf: () => { if (!dev.noGuard) setLowPerf(true); },
      onStats: (s) => { if (dev.perf) setStats(s); },
    };
  }, [dev.perf, dev.noGuard]);

  // Size, visibility (IntersectionObserver + tab visibility), pointer.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(1, e.contentRect.width), h: Math.max(1, e.contentRect.height) }));
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    const vis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", vis);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const s = shared.current;
      s.px = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width) * 2 - 1));
      s.py = Math.max(-1, Math.min(1, -(((ev.clientY - r.top) / r.height) * 2 - 1)));
      s.lastInput = performance.now() / 1000;
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    return () => { ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", move); };
  }, [choice]);

  // Short messages continue on their own after a comfortable reading time; long ones wait for the recipient.
  useEffect(() => {
    if (stage !== "reading" || choice === "pending" || choice === "fallback-2d") return;
    const secs = autoAdvanceSeconds(message);
    if (secs === null || autoCancelled.current || reduced || (dev.t !== undefined && Number.isFinite(dev.t))) return;
    const id = window.setTimeout(() => setStage((st) => (st === "reading" ? "ending" : st)), secs * 1000);
    return () => window.clearTimeout(id);
  }, [stage, message, choice, reduced, dev.t]);

  // Development only: frame-stepped control for screenshots and the preview recording (stripped from production builds).
  useEffect(() => {
    if (IS_PROD) return;
    (window as unknown as { __cinemaSeek?: (t: number) => void }).__cinemaSeek = (t: number) => { shared.current.t = t; shared.current.playing = false; };
    return () => { delete (window as unknown as { __cinemaSeek?: unknown }).__cinemaSeek; };
  }, []);

  const skip = useCallback(() => { shared.current.t = T.end; setStage("reading"); }, []);
  const toEnding = useCallback(() => { autoCancelled.current = true; setStage("ending"); }, []);
  const readAgain = useCallback(() => { autoCancelled.current = true; setStage("reading"); }, []);

  const aspect = size.w / size.h;
  const rect = useMemo(() => pageRect(aspect), [aspect]);
  const mobile = size.w < 700;
  const pagePx = rect.width * size.w;
  const longFactor = message.length > 320 ? 0.84 : message.length > 220 ? 0.92 : 1;
  const fontPx = Math.max(11.5, Math.min(21, pagePx * 0.048 * longFactor));

  if (choice === "fallback-2d") return <div data-cinema data-renderer="fallback-2d" className="size-full"><LumisWishScene {...props} /></div>;
  // (hooks above all run in every branch; the early return is after them on purpose)

  const showPanel = stage === "reading" || (choice === "pending");
  const intro = stage === "intro";
  return (
    <div ref={root} data-cinema data-renderer={choice} data-stage={stage} className="cin-root relative size-full overflow-hidden text-ivory" style={{ touchAction: "pan-y" }}>
      {choice !== "pending" && (
        <div className="absolute inset-0" aria-hidden>
          <CanvasBoundary key={`${replayKey}-${choice}`} onError={() => setFailed(true)}>
            <CinematicCanvas recipient={recipientName} sender={senderName} media={media} shared={shared} mode={mode} enabled={visible} mobile={mobile} events={events} publishStats={dev.perf} />
          </CanvasBoundary>
        </div>
      )}

      {/* the message, set on the 3D page. Real text: legible, selectable, scrollable. */}
      <section
        aria-label="Your greeting"
        className={`cin-page absolute ${showPanel ? "cin-page-on" : ""}`}
        style={{ left: `${rect.left * 100}%`, top: `${rect.top * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, fontSize: `${fontPx}px` }}
      >
        <div className="cin-page-inner" tabIndex={0} onScroll={() => { autoCancelled.current = true; }}>
          <p className="cin-for">For {recipientName}</p>
          <h2 className="cin-greeting">{greeting}</h2>
          <p className="cin-message">{message}</p>
          <p className="cin-from">With love, {senderName}</p>
        </div>
      </section>

      {intro && (
        <button type="button" onClick={skip} className="cin-pill absolute left-3 top-3 z-20">Skip intro</button>
      )}
      {stage === "reading" && choice !== "pending" && (
        <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center" style={{ bottom: "calc(2.9rem + env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={toEnding} className="cin-pill cin-pill-primary pointer-events-auto">Continue</button>
        </div>
      )}

      {/* Mawica ending: shown only after the message, never over it, never redirects */}
      <div className={`cin-end ${stage === "ending" ? "cin-end-on" : ""}`} aria-hidden={stage !== "ending"} inert={stage !== "ending"}>
        <div className="cin-end-inner">
          <p className="cin-wordmark">mawica.</p>
          <Link href="/" className="cin-url">www.mawica.com</Link>
          <p className="cin-send">Send your feelings to others.</p>
          <p className="cin-tag">BRING YOUR WISHES TO LIFE.</p>
          <div className="cin-end-actions">
            <Link href="/create" className="cin-pill cin-pill-primary">Create your own card</Link>
            <button type="button" onClick={readAgain} className="cin-pill">Read again</button>
          </div>
        </div>
      </div>

      {dev.perf && stats && (
        <p data-testid="cinema-stats" className="pointer-events-none absolute bottom-1 left-1 z-30 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white">{stats.fps}fps · {stats.calls} calls · {Math.round(stats.triangles / 1000)}k tris · dpr {stats.dpr.toFixed(2)} · {stats.particles} particles</p>
      )}
      {compact && null}
    </div>
  );
}
