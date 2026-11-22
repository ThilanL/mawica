/**
 * Half-open UTC ranges [from, toExclusive) for ops aggregations.
 * Presets: 7d / 30d / 90d ending at "now"; custom uses calendar days in UTC.
 */

export type OpsDatePreset = "7d" | "30d" | "90d" | "custom";

export type OpsDateRange = {
  preset: OpsDatePreset;
  from: Date;
  /** Exclusive upper bound. */
  toExclusive: Date;
  label: string;
};

const MS_DAY = 86_400_000;
const MAX_SPAN_DAYS = 366;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseYmd(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== day) return null;
  return dt;
}

export function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class OpsDateRangeError extends Error {
  readonly code = "BAD_DATE_RANGE";
  constructor(message: string) {
    super(message);
    this.name = "OpsDateRangeError";
  }
}

/**
 * Resolve a staff-facing date filter into a half-open UTC range.
 * Custom `to` is inclusive of that calendar day (toExclusive = next UTC midnight).
 */
export function resolveOpsDateRange(
  input: { preset?: string | null; from?: string | null; to?: string | null },
  now = new Date(),
): OpsDateRange {
  const presetRaw = (input.preset || "30d").trim().toLowerCase();
  const preset: OpsDatePreset =
    presetRaw === "7d" || presetRaw === "90d" || presetRaw === "custom" || presetRaw === "30d"
      ? presetRaw
      : "30d";

  if (preset === "custom") {
    const from = input.from ? parseYmd(input.from) : null;
    const toDay = input.to ? parseYmd(input.to) : null;
    if (!from || !toDay) {
      throw new OpsDateRangeError("Custom range requires from and to as YYYY-MM-DD");
    }
    const toExclusive = new Date(toDay.getTime() + MS_DAY);
    if (from.getTime() >= toExclusive.getTime()) {
      throw new OpsDateRangeError("from must be on or before to");
    }
    const spanDays = (toExclusive.getTime() - from.getTime()) / MS_DAY;
    if (spanDays > MAX_SPAN_DAYS) {
      throw new OpsDateRangeError(`Range cannot exceed ${MAX_SPAN_DAYS} days`);
    }
    return {
      preset: "custom",
      from,
      toExclusive,
      label: `${formatYmd(from)} → ${formatYmd(toDay)}`,
    };
  }

  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const toExclusive = now;
  const from = new Date(now.getTime() - days * MS_DAY);
  return {
    preset,
    from,
    toExclusive,
    label: `Last ${days} days`,
  };
}

/** Inclusive list of UTC calendar days that intersect [from, toExclusive). */
export function enumerateUtcDays(from: Date, toExclusive: Date): string[] {
  const start = startOfUtcDay(from);
  const end = startOfUtcDay(new Date(toExclusive.getTime() - 1));
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_DAY) {
    out.push(formatYmd(new Date(t)));
  }
  return out;
}

export function inHalfOpenRange(iso: Date, from: Date, toExclusive: Date): boolean {
  const t = iso.getTime();
  return t >= from.getTime() && t < toExclusive.getTime();
}

export { MAX_SPAN_DAYS, MS_DAY, startOfUtcDay };
