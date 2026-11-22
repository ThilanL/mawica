import Link from "next/link";
import { formatYmd } from "@/modules/staff/ops/dates";

export function DateRangeFilter({
  preset,
  from,
  to,
  basePath = "/ops",
}: {
  preset: string;
  from?: string;
  to?: string;
  basePath?: string;
}) {
  const today = formatYmd(new Date());
  const presets = [
    { id: "7d", label: "7 days" },
    { id: "30d", label: "30 days" },
    { id: "90d", label: "90 days" },
  ] as const;

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Link
            key={p.id}
            href={`${basePath}?preset=${p.id}`}
            className={`rounded-full px-3 py-1.5 text-sm ${
              preset === p.id
                ? "bg-[var(--admin-accent)] font-semibold text-[#fff8f4]"
                : "border border-[var(--admin-line)]"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form className="grid gap-3 sm:grid-cols-4" method="get" action={basePath}>
        <input type="hidden" name="preset" value="custom" />
        <label className="text-sm">
          <span className="mb-1 block text-[var(--admin-muted)]">From (UTC)</span>
          <input
            type="date"
            name="from"
            defaultValue={from || ""}
            max={today}
            className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2"
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--admin-muted)]">To (UTC, inclusive)</span>
          <input
            type="date"
            name="to"
            defaultValue={to || ""}
            max={today}
            className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2"
            required
          />
        </label>
        <div className="flex items-end sm:col-span-2">
          <button
            type="submit"
            className="rounded-full border border-[var(--admin-line)] bg-white px-4 py-2 text-sm font-semibold"
          >
            Apply custom range
          </button>
        </div>
      </form>
    </div>
  );
}
