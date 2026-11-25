import { launchMarkets } from "@/content/site";
import { landDots, MAP, MAP_HEIGHT, project } from "./worldDots";

/* Light-surface dot-matrix map of the launch cities (decorative: the clocks list carries the same information). */
const W = MAP.width;
const H = MAP_HEIGHT;
const dots = landDots(launchMarkets);
const route = ["US", "GB", "SE", "FI", "AE", "LK", "AU"] as const;
const labelSide: Record<string, "start" | "end"> = { SE: "end", GB: "end", US: "start", FI: "start", AE: "start", LK: "start", AU: "end" };

export function WorldMap() {
  const pts = Object.fromEntries(launchMarkets.map((m) => [m.code, project(m.lat, m.lon)]));
  const arcs = route.slice(1).map((code, i) => {
    const a = pts[route[i]];
    const b = pts[code];
    const lift = Math.hypot(b.x - a.x, b.y - a.y) * 0.28;
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${((a.x + b.x) / 2).toFixed(1)} ${(Math.min(a.y, b.y) - lift).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="ab-map h-auto w-full">
      <defs>
        <linearGradient id="ab-arc" x1="0" x2="1">
          <stop offset="0" stopColor="#9c7edb" />
          <stop offset="0.5" stopColor="#d969a3" />
          <stop offset="1" stopColor="#d99a2b" />
        </linearGradient>
      </defs>
      <path d={dots.rest} stroke="rgb(42 27 61 / 0.13)" strokeWidth="4.4" strokeLinecap="round" />
      <path d={dots.glow} stroke="rgb(217 105 163 / 0.5)" strokeWidth="4.6" strokeLinecap="round" />
      {arcs.map((d, i) => (
        <path key={i} d={d} className="ab-arc" fill="none" stroke="url(#ab-arc)" strokeWidth="1.8" strokeLinecap="round" />
      ))}
      {launchMarkets.map((m, i) => {
        const p = pts[m.code];
        const side = labelSide[m.code];
        return (
          <g key={m.code}>
            <circle cx={p.x} cy={p.y} r="14" className="ab-ping" style={{ animationDelay: `${i * 0.4}s` }} />
            <circle cx={p.x} cy={p.y} r="9" fill="#fff" stroke="rgb(166 61 120 / 0.55)" strokeWidth="1.5" />
            <circle cx={p.x} cy={p.y} r="5" fill="#a63d78" />
            <text
              x={p.x + (side === "end" ? -16 : 16)}
              y={p.y + (m.code === "FI" ? 14 : m.code === "SE" ? -6 : 5)}
              textAnchor={side}
              className="ab-label"
            >
              {m.city}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
