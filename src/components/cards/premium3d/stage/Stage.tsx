"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { CardEnding } from "@/components/brand/CardEnding";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import type { TemplateKey } from "@/modules/templates/registry";
import type { SceneProps } from "../../types";
import type { CanvasStats, CinemaEvents } from "../CinematicCanvas";
import { newShared, type Shared } from "../rig";
import { autoAdvanceSeconds, chooseRenderer, probeWebGL } from "../support";
import { STAGE_BG } from "./loaders";

// three.js and react-three-fiber live only in this lazy chunk (never in the catalogue or homepage bundles).
const StageCanvas = dynamic(() => import("./StageCanvas"), { ssr: false });
type Stage = "intro" | "reading" | "ending";
const IS_PROD = process.env.NODE_ENV === "production";

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Duration of each card's intro, needed here only for the static "finished" state (kept in sync by tests with each scene's def). */
/**
 * Per-card extras of the shell, only for the snow globe: a one-line hint under the message, an opt-in sound toggle (off by default) and the
 * golden message reveal. Every other card renders exactly as before.
 */
export const STAGE_INTERACTIVE: Partial<Record<TemplateKey, { hint: string; sound: boolean; goldReveal: boolean }>> = {
  "snow-globe": { hint: "Tap the globe, or shake your phone, for a snowstorm", sound: true, goldReveal: true },
};

export const STAGE_DURATION: Record<string, number> = { "snow-globe": 11, "christmas-tree": 11, "special-gift": 11, "warm-wishes": 11, "new-year-2027": 12.5, "new-year-celebration": 11 };

/**
 * Shell shared by the five 3D standard cards. The 3D scene draws everything physical; the personal message is real DOM text on a sheet below
 * the subject (it is never covered by effects). The existing CSS scene is the fallback for no WebGL, a lost context or a slow device.
 */
export function Stage(props: SceneProps & { sceneKey: TemplateKey; Fallback: ComponentType<SceneProps> }) {
  const { sceneKey, Fallback, recipientName, senderName, message, greeting, replayKey, compact = false } = props;
  const reduced = usePrefersReducedMotion();
  const interactive = STAGE_INTERACTIVE[sceneKey];
  const names = useMemo(() => ({ recipient: recipientName, sender: senderName }), [recipientName, senderName]);
  const [sound, setSound] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [lost, setLost] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lowPerf, setLowPerf] = useState(false);
  const [visible, setVisible] = useState(true);
  const [stage, setStage] = useState<Stage>("reading");
  const [dev, setDev] = useState<{ t?: number; renderer?: string; stage?: string; perf: boolean; noGuard: boolean; bare: boolean; zoom: number }>({ perf: false, noGuard: false, bare: false, zoom: 1 });
  const [stats, setStats] = useState<CanvasStats | null>(null);
  const [count, setCount] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const shared = useRef<Shared>(newShared());
  const events = useRef<CinemaEvents>({});
  const autoCancelled = useRef(false);
  const duration = STAGE_DURATION[sceneKey] ?? 11;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = { t: !IS_PROD && q.get("cinemaT") ? Number(q.get("cinemaT")) : undefined, renderer: !IS_PROD ? q.get("renderer") ?? undefined : undefined, stage: !IS_PROD ? q.get("stage") ?? undefined : undefined, perf: !IS_PROD || q.has("perf"), noGuard: q.has("noperfguard"), bare: !IS_PROD && q.has("bare"), zoom: !IS_PROD && Number(q.get("zoom")) > 0 ? Number(q.get("zoom")) : 1 }; // bare: thumbnail renders (no UI, no lift)
    setDev(d); // eslint-disable-line react-hooks/set-state-in-effect -- one-time read of the URL on the client
    setWebgl(d.renderer === "fallback" ? false : probeWebGL());
  }, []);

  const choice = webgl === null ? "pending" : chooseRenderer({ webgl, reducedMotion: reduced, contextLost: lost, failed: failed || lowPerf });
  const mode = choice === "webgl" ? "play" : "static";

  useEffect(() => {
    if (choice === "pending" || choice === "fallback-2d") return;
    autoCancelled.current = false;
    const s = shared.current; s.t = 0; s.playing = true;
    if (choice === "webgl-static") { s.t = duration; setStage("reading"); return; } // eslint-disable-line react-hooks/set-state-in-effect -- stage follows the renderer choice
    if (dev.t !== undefined && Number.isFinite(dev.t)) { s.t = dev.t; s.playing = false; setStage(dev.stage === "ending" ? "ending" : dev.t >= duration ? "reading" : "intro"); return; }
    setStage("intro");
  }, [choice, replayKey, dev.t, dev.stage, duration]);

  useEffect(() => {
    events.current = {
      onDone: () => setStage((st) => (st === "intro" ? "reading" : st)),
      onLost: () => setLost(true),
      onLowPerf: () => { if (!dev.noGuard) setLowPerf(true); },
      onStats: (s) => { if (dev.perf) setStats(s); },
    };
  }, [dev.perf, dev.noGuard]);

  useEffect(() => {
    const el = root.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 }); io.observe(el);
    const vis = () => setVisible(!document.hidden); document.addEventListener("visibilitychange", vis);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect(); const s = shared.current;
      s.px = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width) * 2 - 1));
      s.py = Math.max(-1, Math.min(1, -(((ev.clientY - r.top) / r.height) * 2 - 1)));
      s.lastInput = performance.now() / 1000;
    };
    window.addEventListener("pointermove", move, { passive: true }); window.addEventListener("pointerdown", move, { passive: true });
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", move); };
  }, [choice]);

  // Short messages move on after a comfortable reading time; long ones wait for Continue.
  useEffect(() => {
    if (stage !== "reading" || choice === "pending" || choice === "fallback-2d") return;
    const secs = autoAdvanceSeconds(message);
    if (secs === null || autoCancelled.current || reduced || (dev.t !== undefined && Number.isFinite(dev.t))) return;
    const id = window.setTimeout(() => setStage((st) => (st === "reading" ? "ending" : st)), secs * 1000);
    return () => window.clearTimeout(id);
  }, [stage, message, choice, reduced, dev.t]);

  // Development only: frame-stepped control for screenshots and thumbnail renders; countdown text mirrors the scene.
  useEffect(() => {
    if (IS_PROD) return;
    (window as unknown as { __cinemaSeek?: (t: number) => void }).__cinemaSeek = (t: number) => { shared.current.t = t; shared.current.playing = false; };
    return () => { delete (window as unknown as { __cinemaSeek?: unknown }).__cinemaSeek; };
  }, []);
  useEffect(() => {
    if (stage !== "intro" || !(sceneKey === "new-year-2027")) { setCount(null); return; } // eslint-disable-line react-hooks/set-state-in-effect -- countdown text only exists for the New Year 2027 card
    const id = window.setInterval(() => {
      const t = shared.current.t;
      setCount(t < 0.9 ? null : t < 2.0 ? "3" : t < 3.0 ? "2" : t < 4.0 ? "1" : null);
    }, 80);
    return () => window.clearInterval(id);
  }, [stage, sceneKey]);

  const skip = useCallback(() => { shared.current.t = duration; setStage("reading"); }, [duration]);
  const toEnding = useCallback(() => { autoCancelled.current = true; setStage("ending"); }, []);
  const readAgain = useCallback(() => { autoCancelled.current = true; setStage("reading"); }, []);
  const mobile = typeof window !== "undefined" && window.innerWidth < 700;

  if (choice === "fallback-2d") return <div data-cinema data-renderer="fallback-2d" className="size-full"><Fallback {...props} /></div>;
  const showPanel = stage === "reading" || choice === "pending";
  return (
    <div ref={root} data-cinema data-renderer={choice} data-stage={stage} data-scene={sceneKey} className={`stg-root relative size-full overflow-hidden text-ivory ${dev.bare ? "stg-bare" : ""}`} style={{ touchAction: "pan-y", background: STAGE_BG[sceneKey] }}>
      {choice !== "pending" && (
        <div className="absolute inset-0" aria-hidden>
          <Boundary key={`${replayKey}-${choice}`} onError={() => setFailed(true)}>
            <StageCanvas sceneKey={sceneKey} shared={shared} mode={mode} enabled={visible} mobile={mobile} events={events} publishStats={dev.perf && !dev.bare} bare={dev.bare} zoom={dev.zoom} text={names} />
          </Boundary>
        </div>
      )}
      {count && <p aria-hidden className="stg-count">{count}</p>}
      <section aria-label="Your greeting" className={`stg-panel ${showPanel ? "stg-panel-on" : ""} ${compact ? "stg-compact" : ""} ${interactive?.goldReveal ? "stg-gold" : ""}`}>
        <p className="stg-for">For {recipientName}</p>
        <h2 className="stg-greeting">{greeting}</h2>
        <div className="stg-message" tabIndex={0} onScroll={() => { autoCancelled.current = true; }}><p>{message}</p></div>
        <p className="stg-from">With love, {senderName}</p>
        {interactive && choice === "webgl" && <p className="stg-hint">{interactive.hint}</p>}
        {choice !== "pending" && <button type="button" onClick={toEnding} className="cin-pill cin-pill-primary stg-continue">Continue</button>}
      </section>
      {stage === "intro" && <button type="button" onClick={skip} className="cin-pill absolute left-3 top-3 z-20">Skip intro</button>}
      {interactive?.sound && choice === "webgl" && stage !== "ending" && (
        <button type="button" aria-pressed={sound} onClick={() => { const on = !sound; setSound(on); shared.current.sound = on; }} className={`cin-pill absolute left-3 z-20 text-[0.8rem] ${stage === "intro" ? "top-14" : "top-3"}`}>
          {sound ? "Sound on" : "Sound off"}
        </button>
      )}
      <div className={`cin-end ${stage === "ending" ? "cin-end-on" : ""}`} aria-hidden={stage !== "ending"} inert={stage !== "ending"}>
        <CardEnding onReadAgain={readAgain} />
      </div>
      {dev.perf && !dev.bare && stats && <p data-testid="cinema-stats" className="pointer-events-none absolute left-1 top-1 z-30 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white">{stats.fps}fps · {stats.calls} calls · {Math.round(stats.triangles / 1000)}k tris · dpr {stats.dpr.toFixed(2)}</p>}
    </div>
  );
}

/** Builds the scene component for one card key (each registered as its own lazy chunk). */
export function makeStage(sceneKey: TemplateKey, Fallback: ComponentType<SceneProps>) {
  function StageFor(props: SceneProps) { return <Stage {...props} sceneKey={sceneKey} Fallback={Fallback} />; }
  StageFor.displayName = `Stage(${sceneKey})`;
  return StageFor;
}
