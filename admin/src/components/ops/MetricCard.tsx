export function MetricCard({
  label,
  value,
  hint,
  unavailable,
}: {
  label: string;
  value: string;
  hint?: string;
  unavailable?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4 ${
        unavailable ? "opacity-70" : ""
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--admin-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <p className="mt-1 text-xs text-[var(--admin-muted)]">{hint}</p> : null}
    </div>
  );
}

export function NamedCountList({ rows, empty = "None" }: { rows: { key: string; count: number }[]; empty?: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--admin-muted)]">{empty}</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex justify-between gap-4 border-b border-[var(--admin-line)] py-1.5">
          <span className="break-all">{r.key}</span>
          <span className="tabular-nums text-[var(--admin-muted)]">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
