"use client";

import { useEffect, useState, useTransition } from "react";

type Asset = {
  id: string;
  kind: "IMAGE" | "VIDEO";
  title: string;
  altText: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  originalFilename: string;
  createdAt: string;
  url: string;
  thumbUrl: string | null;
};

function previewSrc(a: Asset): string {
  return `/api/cms/media/${a.id}/file${a.kind === "IMAGE" ? "?variant=thumb" : ""}`;
}

export function MediaLibrary({ canWrite }: { canWrite: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"ALL" | "IMAGE" | "VIDEO">("ALL");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");

  const load = () => {
    start(async () => {
      setError(null);
      const params = new URLSearchParams({ kind });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/cms/media?${params}`);
      const body = (await res.json().catch(() => null)) as { assets?: Asset[]; error?: string } | null;
      if (!res.ok) {
        setError(body?.error || "Failed to load media");
        return;
      }
      setAssets(body?.assets ?? []);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketing media</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--admin-muted)]">
            Public CMS assets only — separate from customer card media. JPEG, PNG, WebP, AVIF, MP4 and WebM.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title / alt / filename"
            className="rounded-lg border border-[var(--admin-line)] px-3 py-2 text-sm"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="rounded-lg border border-[var(--admin-line)] px-3 py-2 text-sm"
          >
            <option value="ALL">All kinds</option>
            <option value="IMAGE">Images</option>
            <option value="VIDEO">Videos</option>
          </select>
          <button
            type="button"
            onClick={load}
            disabled={pending}
            className="rounded-full border border-[var(--admin-line)] px-4 py-2 text-sm font-semibold"
          >
            Search
          </button>
        </div>
      </div>

      {canWrite ? (
        <form
          className="space-y-3 rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("title", title);
            fd.set("altText", altText);
            setError(null);
            start(async () => {
              const res = await fetch("/api/cms/media", { method: "POST", body: fd });
              const body = (await res.json().catch(() => null)) as { error?: string } | null;
              if (!res.ok) {
                setError(body?.error || "Upload failed");
                return;
              }
              setTitle("");
              setAltText("");
              e.currentTarget.reset();
              load();
            });
          }}
        >
          <h2 className="text-lg font-semibold">Upload</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span>Title</span>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                className="w-full rounded-lg border border-[var(--admin-line)] px-3 py-2"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Alt text</span>
              <input
                required
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                maxLength={300}
                className="w-full rounded-lg border border-[var(--admin-line)] px-3 py-2"
              />
            </label>
          </div>
          <input name="file" type="file" required accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[#fff8f4] disabled:opacity-60"
          >
            {pending ? "Working…" : "Upload asset"}
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((a) => (
          <li key={a.id} className="overflow-hidden rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)]">
            <div className="grid aspect-video place-items-center bg-black/5">
              {a.kind === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewSrc(a)} alt={a.altText} className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="px-4 text-center text-sm text-[var(--admin-muted)]">
                  <p className="font-semibold text-[var(--admin-ink)]">Video</p>
                  <p>{a.contentType}</p>
                </div>
              )}
            </div>
            <div className="space-y-2 p-3 text-sm">
              <p className="font-medium">{a.title}</p>
              <p className="text-xs text-[var(--admin-muted)]">
                {a.kind} · {(a.byteSize / 1024).toFixed(0)} KB
                {a.width && a.height ? ` · ${a.width}×${a.height}` : ""}
              </p>
              <p className="break-all font-mono text-[10px] text-[var(--admin-muted)]">{a.id}</p>
              <p className="text-xs text-[var(--admin-muted)]">Public: {a.url}</p>
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-full border border-[var(--admin-line)] px-3 py-1 text-xs font-semibold">
                    Replace file
                    <input
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        const fd = new FormData();
                        fd.set("file", file);
                        start(async () => {
                          const res = await fetch(`/api/cms/media/${a.id}/replace`, {
                            method: "POST",
                            body: fd,
                          });
                          const body = (await res.json().catch(() => null)) as { error?: string } | null;
                          if (!res.ok) {
                            setError(body?.error || "Replace failed");
                            return;
                          }
                          load();
                        });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-800"
                    onClick={() => {
                      start(async () => {
                        const res = await fetch(`/api/cms/media/${a.id}`, { method: "DELETE" });
                        const body = (await res.json().catch(() => null)) as { error?: string } | null;
                        if (!res.ok) {
                          setError(body?.error || "Delete failed");
                          return;
                        }
                        load();
                      });
                    }}
                  >
                    Soft-delete
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {assets.length === 0 && !error ? (
        <p className="text-sm text-[var(--admin-muted)]">No marketing assets yet.</p>
      ) : null}
    </div>
  );
}
