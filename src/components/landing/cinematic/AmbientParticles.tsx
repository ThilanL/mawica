"use client";

import { useEffect, useRef } from "react";
import type { CelebrationTheme } from "@/content/celebrations";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  rot: number;
  vr: number;
  hue: number;
};

/**
 * Extremely subtle decorative particles above the video, behind copy.
 * Videos already animate — keep this sparse. Off for reduced motion.
 */
export function AmbientParticles({
  mode,
  count = 18,
}: {
  mode: CelebrationTheme["particle"];
  count?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reduced) return;

    let w = 0,
      h = 0,
      raf = 0,
      visible = true,
      last = 0;
    const parts: Particle[] = [];
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const seed = () => {
      parts.length = 0;
      for (let i = 0; i < count; i++) {
        parts.push({
          x: rand(0, w),
          y: rand(0, h),
          vx: mode === "confetti" ? rand(-0.15, 0.15) : rand(-0.08, 0.08),
          vy: mode === "snow" ? rand(0.12, 0.35) : mode === "petals" ? rand(0.08, 0.22) : rand(0.15, 0.4),
          r: mode === "confetti" ? rand(1.2, 2.4) : rand(0.8, 2.1),
          a: rand(0.12, 0.35),
          rot: rand(0, Math.PI * 2),
          vr: rand(-0.02, 0.02),
          hue:
            mode === "snow"
              ? 40
              : mode === "petals"
                ? rand(340, 20)
                : rand(0, 360),
        });
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = (t: number) => {
      if (!visible) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dt = Math.min(32, t - last || 16) / 16;
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx * dt + (mode === "snow" ? Math.sin(t / 900 + p.y) * 0.08 : 0);
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > h + 4) {
          p.y = -4;
          p.x = rand(0, w);
        }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.a;
        if (mode === "confetti") {
          ctx.fillStyle = `hsla(${p.hue}, 70%, 72%, 1)`;
          ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        } else if (mode === "petals") {
          ctx.fillStyle = `hsla(${p.hue}, 55%, 78%, 1)`;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * 1.4, p.r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(255, 248, 236, 1)`;
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
          if (p.r > 1.4) {
            ctx.fillStyle = `rgba(244, 195, 113, ${p.a * 0.5})`;
            ctx.beginPath();
            ctx.arc(p.r * 2, -p.r, p.r * 0.35, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e?.isIntersecting ?? true;
      },
      { threshold: 0.05 },
    );
    io.observe(canvas);
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [mode, count, reduced]);

  if (reduced) return null;

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[2] h-full w-full opacity-70"
    />
  );
}
