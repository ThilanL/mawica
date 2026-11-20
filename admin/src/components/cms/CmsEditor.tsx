"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MediaPicker } from "@/components/cms/MediaPicker";

type Revision = {
  id: string;
  revisionNumber: number;
  note: string | null;
  publishedAt: string;
  publishedByStaffId: string | null;
};

function isCampaignKey(key: string): boolean {
  return key === "campaign.christmas" || key === "campaign.newyear";
}

export function CmsEditor({
  documentKey,
  title,
  initialPayload,
  draftVersion,
  publishedAt,
  revisions,
  canWrite,
  canPublish,
}: {
  documentKey: string;
  title: string;
  initialPayload: unknown;
  draftVersion: number;
  publishedAt: string | null;
  revisions: Revision[];
  canWrite: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(() => JSON.stringify(initialPayload, null, 2));
  const [version, setVersion] = useState(draftVersion);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [history, setHistory] = useState(revisions);

  const parsePayload = (): unknown | null => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      setError("Draft JSON is invalid");
      return null;
    }
  };

  const campaignPreview = useMemo(() => {
    if (!isCampaignKey(documentKey)) return null;
    try {
      return JSON.parse(text) as {
        title?: string;
        description?: string;
        ctaLabel?: string;
        ctaHref?: string;
        mediaAssetId?: string | null;
        sectionVisible?: boolean;
        startsAt?: string;
        endsAt?: string;
        anchorId?: string;
      };
    } catch {
      return null;
    }
  }, [documentKey, text]);

  const setCampaignMedia = (id: string | null) => {
    const parsed = parsePayload();
    if (!parsed || typeof parsed !== "object") return;
    const next = { ...(parsed as Record<string, unknown>), mediaAssetId: id };
    setText(JSON.stringify(next, null, 2));
  };

  const save = () => {
    const payload = parsePayload();
    if (payload == null) return;
    setError(null);
    setOk(null);
    start(async () => {
      const res = await fetch(`/api/cms/${encodeURIComponent(documentKey)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload, expectedDraftVersion: version }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; draftVersion?: number; draftPayload?: unknown; revisions?: Revision[] }
        | null;
      if (!res.ok) {
        setError(body?.error || "Save failed");
        if (res.status === 409) router.refresh();
        return;
      }
      if (typeof body?.draftVersion === "number") setVersion(body.draftVersion);
      if (body?.draftPayload != null) setText(JSON.stringify(body.draftPayload, null, 2));
      if (body?.revisions) setHistory(body.revisions);
      setOk(`Draft saved (v${body?.draftVersion ?? version + 1})`);
      router.refresh();
    });
  };

  const publish = () => {
    const payload = parsePayload();
    if (payload == null) return;
    setError(null);
    setOk(null);
    start(async () => {
      // Persist latest editor text before publish so draft matches what the staffer sees.
      const saveRes = await fetch(`/api/cms/${encodeURIComponent(documentKey)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload, expectedDraftVersion: version }),
      });
      const saved = (await saveRes.json().catch(() => null)) as
        | { error?: string; draftVersion?: number; draftPayload?: unknown }
        | null;
      if (!saveRes.ok) {
        setError(saved?.error || "Save before publish failed");
        return;
      }
      const nextVersion = typeof saved?.draftVersion === "number" ? saved.draftVersion : version + 1;
      setVersion(nextVersion);
      if (saved?.draftPayload != null) setText(JSON.stringify(saved.draftPayload, null, 2));

      const res = await fetch(`/api/cms/${encodeURIComponent(documentKey)}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedDraftVersion: nextVersion, note: note.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; revisions?: Revision[]; publishedAt?: string | null }
        | null;
      if (!res.ok) {
        setError(body?.error || "Publish failed");
        if (res.status === 409) router.refresh();
        return;
      }
      if (body?.revisions) setHistory(body.revisions);
      setNote("");
      setOk("Published successfully");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--admin-muted)]">{documentKey}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-[var(--admin-muted)]">
            Draft v{version}
            {publishedAt ? ` · Last published ${new Date(publishedAt).toLocaleString()}` : " · Never published"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-full border border-[var(--admin-line)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {pending ? "Working…" : "Save draft"}
            </button>
          ) : null}
          {canPublish ? (
            <button
              type="button"
              disabled={pending}
              onClick={publish}
              className="rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[#fff8f4] disabled:opacity-60"
            >
              {pending ? "Working…" : "Publish"}
            </button>
          ) : null}
        </div>
      </div>

      <p className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-card)] px-4 py-3 text-sm text-[var(--admin-muted)]">
        Plain JSON only — no HTML, scripts, or component injection. URLs must be relative paths or https://mawica.com.
        Drafts never appear on the public site until published. Campaign rollback uses publication history below.
      </p>

      {isCampaignKey(documentKey) && canWrite ? (
        <MediaPicker
          value={typeof campaignPreview?.mediaAssetId === "string" ? campaignPreview.mediaAssetId : null}
          onChange={setCampaignMedia}
          disabled={pending}
        />
      ) : null}

      {campaignPreview ? (
        <section className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
          <h2 className="text-lg font-semibold">Campaign preview (draft)</h2>
          <p className="mt-1 text-sm text-[var(--admin-muted)]">
            Visible: {String(campaignPreview.sectionVisible)} · Anchor #{campaignPreview.anchorId} ·{" "}
            {campaignPreview.startsAt} → {campaignPreview.endsAt}
          </p>
          <div className="mt-4 rounded-xl bg-white/60 p-4">
            <h3 className="font-display text-2xl">{campaignPreview.title}</h3>
            <p className="mt-2 text-[var(--admin-muted)]">{campaignPreview.description}</p>
            <p className="mt-3 text-sm font-semibold">
              CTA: {campaignPreview.ctaLabel} → {campaignPreview.ctaHref}
            </p>
            {campaignPreview.mediaAssetId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/cms/media/${campaignPreview.mediaAssetId}/file?variant=thumb`}
                alt=""
                className="mt-4 max-h-40 rounded-lg object-contain"
              />
            ) : (
              <p className="mt-3 text-xs text-[var(--admin-muted)]">No media assigned</p>
            )}
          </div>
        </section>
      ) : null}

      <label className="block space-y-2">
        <span className="text-sm font-medium">Draft payload</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          disabled={!canWrite || pending}
          rows={isCampaignKey(documentKey) ? 18 : 28}
          className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2 font-mono text-xs leading-relaxed disabled:opacity-70"
        />
      </label>

      {canPublish ? (
        <label className="block max-w-xl space-y-2">
          <span className="text-sm font-medium">Publish note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            disabled={pending}
            placeholder="e.g. Christmas hero refresh"
            className="w-full rounded-lg border border-[var(--admin-line)] px-3 py-2 text-sm"
          />
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-800">{ok}</p> : null}

      <section className="rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
        <h2 className="text-lg font-semibold">Publication history</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--admin-muted)]">No published revisions yet.</p>
        ) : (
          <ol className="mt-3 space-y-2 text-sm">
            {history.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--admin-line)] pt-2 first:border-t-0 first:pt-0">
                <span className="font-medium">Rev {r.revisionNumber}</span>
                <span className="text-[var(--admin-muted)]">{new Date(r.publishedAt).toLocaleString()}</span>
                {r.note ? <span>{r.note}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
