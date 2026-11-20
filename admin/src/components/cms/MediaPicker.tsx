"use client";

import { useEffect, useState } from "react";

type Asset = {
  id: string;
  kind: "IMAGE" | "VIDEO";
  title: string;
  thumbUrl: string | null;
};

export function MediaPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch("/api/cms/media?kind=ALL");
      const body = (await res.json().catch(() => null)) as { assets?: Asset[]; error?: string } | null;
      if (!res.ok) {
        setError(body?.error || "Failed to load");
        return;
      }
      setAssets(body?.assets ?? []);
    })();
  }, [open]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Media asset</span>
        <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">{value ?? "none"}</code>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-[var(--admin-line)] px-3 py-1 text-xs font-semibold"
        >
          {open ? "Close picker" : "Choose from library"}
        </button>
        {value ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="rounded-full border border-[var(--admin-line)] px-3 py-1 text-xs"
          >
            Clear
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {open ? (
        <ul className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-[var(--admin-line)] p-2 sm:grid-cols-3">
          {assets.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(a.id);
                  setOpen(false);
                }}
                className={`w-full rounded-lg border p-2 text-left text-xs ${
                  value === a.id ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/10" : "border-[var(--admin-line)]"
                }`}
              >
                <div className="mb-1 grid aspect-video place-items-center bg-black/5">
                  {a.kind === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/cms/media/${a.id}/file?variant=thumb`} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span>Video</span>
                  )}
                </div>
                {a.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
