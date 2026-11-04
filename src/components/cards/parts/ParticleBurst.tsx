"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";

export type BurstMode = "confetti" | "sparks" | "firework";
export type BurstHandle = { burst: (mode: BurstMode, x?: number, y?: number) => void };

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; color: string; rot: number; vr: number; shape: "dot" | "rect"; g: number };
const COLORS = { confetti: ["#D969A3", "#9C7EDB", "#F4C371", "#F7E6EF", "#FFF8F4"], sparks: ["#F4C371", "#FFE3A8", "#FFF8F4"], firework: ["#F4C371", "#D969A3", "#FFF8F4", "#9C7EDB"] } as const;

/**
 * One-shot particle bursts on a canvas. Idle = no animation frames. x/y are 0..1 of the canvas.
 * Nothing is emitted for reduced motion.
 */
export function ParticleBurst({ ref, className = "" }: { ref?: Ref<BurstHandle>; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const raf = useRef(0);
  const reduced = usePrefersReducedMotion();
  const loop = useRef<(t: number) => void>(() => {});

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    let w = 0, h = 0, last = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = c.clientWidth; h = c.clientHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    loop.current = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
      ctx.clearRect(0, 0, w, h);
      parts.current = parts.current.filter((p) => p.life < p.max);
      for (const p of parts.current) {
        p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const a = Math.max(0, 1 - p.life / p.max);
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        if (p.shape === "dot") { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); ctx.restore(); }
      }
      ctx.globalAlpha = 1;
      if (parts.current.length) raf.current = requestAnimationFrame(loop.current);
      else { raf.current = 0; last = 0; ctx.clearRect(0, 0, w, h); }
    };
    const ro = new ResizeObserver(resize); ro.observe(c); resize();
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); raf.current = 0; parts.current = []; };
  }, []);

  useImperativeHandle(ref, () => ({
    burst(mode, x = 0.5, y = 0.5) {
      const c = canvas.current;
      if (!c || reduced) return;
      const w = c.clientWidth, h = c.clientHeight, cols = COLORS[mode], rnd = (a: number, b: number) => a + Math.random() * (b - a);
      const pick = () => cols[Math.floor(Math.random() * cols.length)];
      const add: P[] = [];
      if (mode === "confetti") {
        for (let i = 0; i < 90; i++) add.push({ x: rnd(0, w), y: rnd(-30, -4), vx: rnd(-40, 40), vy: rnd(60, 160), life: 0, max: rnd(3.2, 5), r: rnd(3, 6), color: pick(), rot: rnd(0, 6), vr: rnd(-8, 8), shape: "rect", g: 40 });
      } else {
        const n = mode === "firework" ? 80 : 55, sp = mode === "firework" ? 190 : 120;
        for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), s = rnd(sp * 0.35, sp); add.push({ x: x * w, y: y * h, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (mode === "sparks" ? 40 : 0), life: 0, max: rnd(1, 1.9), r: rnd(1.2, 2.6), color: pick(), rot: 0, vr: 0, shape: "dot", g: mode === "firework" ? 110 : 60 }); }
      }
      parts.current.push(...add);
      if (!raf.current) raf.current = requestAnimationFrame(loop.current);
    },
  }), [reduced]);

  return <canvas ref={canvas} aria-hidden className={`pointer-events-none absolute inset-0 z-20 size-full ${className}`} />;
}
