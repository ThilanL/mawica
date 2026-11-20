import type { MonthProjection } from "@/modules/staff/finance/types";

export function ProjectionChart({
  months,
  series,
}: {
  months: MonthProjection[];
  series: { key: keyof MonthProjection; label: string; color: string }[];
}) {
  if (months.length === 0) {
    return <p className="text-sm text-[var(--admin-muted)]">No projection months.</p>;
  }

  const values = series.flatMap((s) => months.map((m) => Number(m[s.key]) || 0));
  const max = Math.max(1, ...values.map(Math.abs));
  const w = Math.max(320, months.length * 14);
  const h = 160;
  const pad = 8;

  return (
    <div className="overflow-x-auto">
      <svg role="img" aria-label="Projection chart" viewBox={`0 0 ${w} ${h}`} className="h-40 w-full min-w-[320px]">
        {series.map((s) => {
          const pts = months
            .map((m, i) => {
              const v = Number(m[s.key]) || 0;
              const x = pad + (i / Math.max(1, months.length - 1)) * (w - pad * 2);
              const y = h - pad - ((v + max) / (2 * max)) * (h - pad * 2);
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" points={pts}>
              <title>{s.label}</title>
            </polyline>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--admin-muted)]">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="inline-block h-2 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
