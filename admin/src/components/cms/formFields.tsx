"use client";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-[var(--admin-muted)]">{hint}</span> : null}
      {error ? (
        <span className="block text-xs text-red-700" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  disabled,
  maxLength,
  multiline,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
}) {
  const cls =
    "w-full rounded-lg border border-[var(--admin-line)] bg-white px-3 py-2 text-sm disabled:opacity-70";
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        rows={rows}
        className={cls}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      maxLength={maxLength}
      className={cls}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition ${
        checked ? "bg-[var(--admin-accent)]" : "bg-black/15"
      } disabled:opacity-60`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--admin-muted)]">{description}</p> : null}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
