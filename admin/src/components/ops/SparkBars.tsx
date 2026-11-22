import type { SeriesPoint } from "@/modules/staff/ops/analytics";

/** Compact responsive SVG bar series — no chart library. */
export function SparkBars({
  series,
  label,
  emptyLabel = "No data in this range",
}: {
  series: SeriesPoint[];
  label: string;
  emptyLabel?: string;
}) {
  const max = Math.max(0, ...series.map((p) => p.count));
  if (series.length === 0 || max === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--admin-line)] px-3 py-8 text-center text-sm text-[var(--admin-muted)]">
        {emptyLabel}
      </div>
    );
  }

  const w = Math.max(240, series.length * 10);
  const h = 96;
  const barW = Math.max(2, (w - 8) / series.length - 1);

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--admin-muted)]">{label}</p>
      <svg
        role="img"
        aria-label={`${label}: peak ${max}`}
        viewBox={`0 0 ${w} ${h}`}
        className="h-24 w-full min-w-[240px]"
        preserveAspectRatio="none"
      >
        {series.map((p, i) => {
          const bh = max === 0 ? 0 : (p.count / max) * (h - 8);
          const x = 4 + i * (barW + 1);
          const y = h - 4 - bh;
          return (
            <rect
              key={p.day}
              x={x}
              y={y}
              width={barW}
              height={Math.max(bh, p.count > 0 ? 2 : 0)}
              fill="var(--admin-accent)"
              opacity={0.85}
            >
              <title>
                {p.day}: {p.count}
              </title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
