"use client";

/**
 * Lumi's 3D stage for the homepage "Meet Lumi" section. This module is only ever loaded (via next/dynamic)
 * after the visitor activates the section, because it pulls in Three.js and react-three-fiber.
 * It owns the canvas, pause/resume, WebGL fallback and reduced motion; the guided flow lives in MeetLumi.
 */
import { Component, useEffect, useRef, useSyncExternalStore, useImperativeHandle, type ReactNode, type Ref } from "react";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import LumiCanvas, { type LumiControls } from "./LumiCanvas";
import { webglAvailable } from "./lumiMath";
import { useRunning } from "./useRunning";

export type LumiStageHandle = LumiControls;

class Boundary extends Component<{ fallback: ReactNode; onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const subscribeNone = () => () => {};
// Composition shared with the static preview in MeetLumi: Lumi sits slightly low so a hop never clips the top tip.
const ANCHOR = { x: 0, y: -0.1 };
const SIZE = 0.36;

export default function LumiStage({ awake, mood = "happy", onReady, onFallback, handle, fallbackSrc }: {
  awake: boolean;
  mood?: "happy" | "curious";
  onReady: () => void;
  /** Called when 3D is unavailable (no WebGL or a runtime failure) so the flow can continue without it. */
  onFallback: () => void;
  handle: Ref<LumiStageHandle>;
  fallbackSrc: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const controls = useRef<LumiControls | null>(null);
  const reduced = usePrefersReducedMotion();
  const running = useRunning(wrap);
  const webgl = useSyncExternalStore(subscribeNone, webglAvailable, () => true);
  const notified = useRef(false);

  useImperativeHandle(handle, () => ({
    celebrate: () => controls.current?.celebrate(),
    poke: (x, y) => controls.current?.poke(x, y),
    look: (x, y, s) => controls.current?.look(x, y, s),
  }), []);

  const fail = () => { if (!notified.current) { notified.current = true; onFallback(); } };
  useEffect(() => { if (!webgl) fail(); });
  if (!webgl) return <>{fallbackSrc}</>;

  return (
    <div ref={wrap} className="absolute inset-0">
      <Boundary fallback={fallbackSrc} onFail={fail}>
        <LumiCanvas anchor={ANCHOR} size={SIZE} running={running} reduced={reduced} controls={controls} awake={awake} mood={mood} onReady={onReady} onLost={fail} onLowPerf={fail} />
      </Boundary>
    </div>
  );
}

