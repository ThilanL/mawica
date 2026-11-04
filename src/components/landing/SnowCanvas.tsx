"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";

type Flake = { x: number; y: number; r: number; vy: number; sway: number; phase: number; a: number };

/**
 * Lightweight canvas snowfall. Pauses when off-screen or the tab is hidden,
 * caps device pixel ratio, and renders a single static frame for reduced motion.
 */
export function SnowCanvas({
  count = 70,
  speed = 1,
  color = "255,248,244",
  className = "",
}: {
  count?: number;
  speed?: number;
  color?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0, h = 0, raf = 0, visible = true, last = 0;
    const flakes: Flake[] = [];
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes.length = 0;
      for (let i = 0; i < count; i++) {
        flakes.push({ x: rand(0, w), y: rand(0, h), r: rand(0.8, 2.8), vy: rand(14, 34), sway: rand(6, 18), phase: rand(0, 6.28), a: rand(0.4, 0.95) });
      }
      draw(0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        const x = f.x + Math.sin(t * 0.0006 + f.phase) * f.sway;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${color},${f.a})`;
        ctx.arc(x, f.y, f.r, 0, 6.283);
        ctx.fill();
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      for (const f of flakes) {
        f.y += f.vy * speed * dt;
        if (f.y > h + 4) { f.y = -4; f.x = rand(0, w); }
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    };

    const start = () => { if (!raf && visible && !document.hidden && !reduced) { last = 0; raf = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    resize();
    start();

    return () => { stop(); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [count, speed, color, reduced]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`} />;
}
