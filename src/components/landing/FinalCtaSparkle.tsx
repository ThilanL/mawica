"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";

/**
 * A few tiny champagne particles that drift left→right once the section is in view,
 * symbolising a greeting travelling between generations. Stays clear of faces.
 */
export function FinalCtaSparkle({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reduced || !active) return;

    let w = 0,
      h = 0,
      raf = 0;
    const start = performance.now();

    type Dot = { t0: number; lag: number; yJitter: number; size: number; life: number };
    const dots: Dot[] = Array.from({ length: 5 }, (_, i) => ({
      t0: i * 0.55,
      lag: i * 0.12,
      yJitter: (i % 2 === 0 ? -1 : 1) * (4 + i * 3),
      size: 1.2 + (i % 3) * 0.45,
      life: 4.2 + i * 0.35,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const elapsed = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      // Horizontal band through the luminous centre — avoid face regions at the edges.
      const yBase = h * 0.48;
      const x0 = w * 0.18;
      const x1 = w * 0.82;

      for (const d of dots) {
        const local = elapsed - d.t0;
        if (local < 0) continue;
        const cycle = ((local % d.life) / d.life);
        const x = x0 + (x1 - x0) * cycle;
        const y = yBase + d.yJitter + Math.sin(cycle * Math.PI * 2) * 6;
        const fade = Math.sin(cycle * Math.PI); // ease in/out
        const a = 0.15 + fade * 0.45;

        ctx.beginPath();
        ctx.fillStyle = `rgba(216, 180, 119, ${a})`;
        ctx.arc(x, y, d.size, 0, Math.PI * 2);
        ctx.fill();

        // Tiny soft halo
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 249, 245, ${a * 0.35})`;
        ctx.arc(x, y, d.size * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [active, reduced]);

  if (reduced) return null;

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[2] hidden h-full w-full md:block"
    />
  );
}
