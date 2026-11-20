"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { documentSchemas, type CmsDocumentKey } from "@mawica/modules/cms";
import { DocumentForm, type FieldErrors } from "@/components/cms/DocumentForm";
import { CmsPreview } from "@/components/cms/CmsPreview";

type Revision = {
  id: string;
  revisionNumber: number;
  note: string | null;
  publishedAt: string;
  publishedByStaffId: string | null;
  publishedByName?: string | null;
  publishedByEmail?: string | null;
};

function issuesToMap(issues: Array<{ path: string; message: string }> | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues ?? []) {
    if (!out[i.path]) out[i.path] = i.message;
  }
  return out;
}

function clientValidate(key: string, payload: unknown): FieldErrors {
  const schema = documentSchemas[key as CmsDocumentKey];
  if (!schema) return { "(root)": "Unknown document" };
  const result = schema.safeParse(payload);
  if (result.success) return {};
  return issuesToMap(
    result.error.issues.map((i) => ({
      path: i.path.length ? i.path.map(String).join(".") : "(root)",
      message: i.message,
    })),
  );
}

function shallowDiff(a: unknown, b: unknown): Array<{ path: string; draft: string; other: string }> {
  const rows: Array<{ path: string; draft: string; other: string }> = [];
  const walk = (left: unknown, right: unknown, path: string) => {
    if (Object.is(left, right)) return;
    if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
      const keys = new Set([...Object.keys(left as object), ...Object.keys(right as object)]);
      for (const k of keys) {
        walk((left as Record<string, unknown>)[k], (right as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
      }
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      const n = Math.max(left.length, right.length);
      for (let i = 0; i < n; i++) walk(left[i], right[i], `${path}.${i}`);
      return;
    }
    rows.push({
      path: path || "(root)",
      draft: JSON.stringify(left ?? null),
      other: JSON.stringify(right ?? null),
    });
  };
  walk(a, b, "");
  return rows.slice(0, 80);
}

export function CmsEditor({
  documentKey,
  title,
  initialPayload,
  draftVersion,
  publishedAt,
  publishedPayload,
  state,
  revisions,
  canWrite,
  canPublish,
}: {
  documentKey: string;
  title: string;
  initialPayload: unknown;
  draftVersion: number;
  publishedAt: string | null;
  publishedPayload: unknown | null;
  state: "draft_only" | "published";
  revisions: Revision[];
  canWrite: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [payload, setPayload] = useState<unknown>(initialPayload);
  const [version, setVersion] = useState(draftVersion);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [history, setHistory] = useState(revisions);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [comparePayload, setComparePayload] = useState<unknown | null>(null);
  const [compareLabel, setCompareLabel] = useState("");

  const liveDiff = useMemo(() => {
    if (!comparePayload) return [];
    return shallowDiff(payload, comparePayload);
  }, [payload, comparePayload]);

  const stateBadge =
    state === "published"
      ? { label: "Published live", className: "bg-emerald-100 text-emerald-900" }
      : { label: "Draft only (public uses TypeScript fallback)", className: "bg-amber-100 text-amber-950" };

  const applyDoc = (body: {
    draftVersion?: number;
    draftPayload?: unknown;
    revisions?: Revision[];
    publishedAt?: string | null;
  }) => {
    if (typeof body.draftVersion === "number") setVersion(body.draftVersion);
    if (body.draftPayload != null) setPayload(body.draftPayload);
    if (body.revisions) {
      setHistory(
        body.revisions.map((r) => ({
          ...r,
          publishedAt: typeof r.publishedAt === "string" ? r.publishedAt : String(r.publishedAt),
        })),
      );
    }
  };

  const save = () => {
    const local = clientValidate(documentKey, payload);
    setFieldErrors(local);
    if (Object.keys(local).length) {
      setError("Fix the highlighted fields before saving");
      return;
    }
    setError(null);
    setOk(null);
    start(async () => {
      const res = await fetch(`/api/cms/${encodeURIComponent(documentKey)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload, expectedDraftVersion: version }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            error?: string;
            issues?: Array<{ path: string; message: string }>;
            draftVersion?: number;
            draftPayload?: unknown;
            revisions?: Revision[];
          }
        | null;
      if (!res.ok) {
        setError(body?.error || "Save failed");
        setFieldErrors(issuesToMap(body?.issues));
        if (res.status === 409) router.refresh();
        return;
      }
      applyDoc(body ?? {});
      setFieldErrors({});
      setOk(`Draft saved (v${body?.draftVersion ?? version + 1})`);
      router.refresh();
    });
  };

  const doPublish = () => {
    setConfirmPublish(false);
    const local = clientValidate(documentKey, payload);
    setFieldErrors(local);
    if (Object.keys(local).length) {
      setError("Fix validation errors before publishing");
      return;
    }
    setError(null);
    setOk(null);
    start(async () => {
      const saveRes = await fetch(`/api/cms/${encodeURIComponent(documentKey)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload, expectedDraftVersion: version }),
      });
      const saved = (await saveRes.json().catch(() => null)) as
        | { error?: string; issues?: Array<{ path: string; message: string }>; draftVersion?: number; draftPayload?: unknown }
        | null;
      if (!saveRes.ok) {
        setError(saved?.error || "Save before publish failed");
        setFieldErrors(issuesToMap(saved?.issues));
        return;
      }
      const nextVersion = typeof saved?.draftVersion === "number" ? saved.draftVersion : version + 1;
      setVersion(nextVersion);
      if (saved?.draftPayload != null) setPayload(saved.draftPayload);

      const res = await fetch(`/api/cms/${encodeURIComponent(documentKey)}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedDraftVersion: nextVersion, note: note.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; issues?: Array<{ path: string; message: string }>; revisions?: Revision[] }
        | null;
      if (!res.ok) {
        setError(body?.error || "Publish failed");
        setFieldErrors(issuesToMap(body?.issues));
        if (res.status === 409) router.refresh();
        return;
      }
      applyDoc(body ?? {});
      setNote("");
      setOk("Published successfully — public site will use this revision");
      router.refresh();
    });
  };

  const loadCompare = (rev: Revision) => {
    start(async () => {
      setError(null);
      const res = await fetch(
        `/api/cms/${encodeURIComponent(documentKey)}/revisions/${encodeURIComponent(rev.id)}`,
      );
      const body = (await res.json().catch(() => null)) as
        | { error?: string; revision?: { payload: unknown; revisionNumber: number } }
        | null;
      if (!res.ok) {
        setError(body?.error || "Failed to load revision");
        return;
      }
      setCompareId(rev.id);
      setComparePayload(body?.revision?.payload ?? null);
      setCompareLabel(`Rev ${body?.revision?.revisionNumber ?? rev.revisionNumber}`);
    });
  };

  const comparePublished = () => {
    if (publishedPayload == null) {
      setError("No published revision to compare");
      return;
    }
    setCompareId("published");
    setComparePayload(publishedPayload);
    setCompareLabel("Live published");
  };

  const restore = (rev: Revision) => {
    if (!canWrite) return;
    if (!window.confirm(`Restore revision ${rev.revisionNumber} into a new draft? This does not publish.`)) return;
    setError(null);
    setOk(null);
    start(async () => {
      const res = await fetch(`/api/cms/${encodeURIComponent(documentKey)}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revisionId: rev.id, expectedDraftVersion: version }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            error?: string;
            issues?: Array<{ path: string; message: string }>;
            draftVersion?: number;
            draftPayload?: unknown;
            revisions?: Revision[];
          }
        | null;
      if (!res.ok) {
        setError(body?.error || "Restore failed");
        setFieldErrors(issuesToMap(body?.issues));
        if (res.status === 409) router.refresh();
        return;
      }
      applyDoc(body ?? {});
      setFieldErrors({});
      setOk(`Restored rev ${rev.revisionNumber} into draft v${body?.draftVersion}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--admin-muted)]">{documentKey}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${stateBadge.className}`}>
              {stateBadge.label}
            </span>
            <span className="text-[var(--admin-muted)]">
              Draft v{version}
              {publishedAt ? ` · Last published ${new Date(publishedAt).toLocaleString()}` : ""}
            </span>
          </div>
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
              onClick={() => setConfirmPublish(true)}
              className="rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[#fff8f4] disabled:opacity-60"
            >
              Publish…
            </button>
          ) : (
            <p className="self-center text-xs text-[var(--admin-muted)]">Publish requires OWNER</p>
          )}
        </div>
      </div>

      <p className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-card)] px-4 py-3 text-sm text-[var(--admin-muted)]">
        Structured editor — plain text only (no HTML/scripts). Drafts stay private until an OWNER publishes.
        Public pages keep TypeScript fallbacks when nothing is published. Preview below is staff-session only.
      </p>

      <DocumentForm
        documentKey={documentKey}
        value={payload}
        onChange={setPayload}
        errors={fieldErrors}
        disabled={!canWrite || pending}
      />

      <CmsPreview documentKey={documentKey} payload={payload} />

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Revision history</h2>
          {publishedPayload != null ? (
            <button
              type="button"
              onClick={comparePublished}
              className="rounded-full border border-[var(--admin-line)] px-3 py-1 text-xs font-semibold"
            >
              Compare draft ↔ live
            </button>
          ) : null}
        </div>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--admin-muted)]">No published revisions yet — public site uses TypeScript fallback.</p>
        ) : (
          <ol className="mt-3 space-y-2 text-sm">
            {history.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--admin-line)] pt-2 first:border-t-0 first:pt-0"
              >
                <span className="font-medium">Rev {r.revisionNumber}</span>
                <span className="text-[var(--admin-muted)]">{new Date(r.publishedAt).toLocaleString()}</span>
                <span className="text-[var(--admin-muted)]">
                  {r.publishedByName || r.publishedByEmail || r.publishedByStaffId || "Unknown author"}
                </span>
                {r.note ? <span>{r.note}</span> : null}
                <span className="ml-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-[var(--admin-line)] px-2.5 py-0.5 text-xs font-semibold"
                    onClick={() => loadCompare(r)}
                  >
                    Compare
                  </button>
                  {canWrite ? (
                    <button
                      type="button"
                      className="rounded-full border border-[var(--admin-line)] px-2.5 py-0.5 text-xs font-semibold"
                      onClick={() => restore(r)}
                      disabled={pending}
                    >
                      Restore to draft
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}

        {comparePayload != null ? (
          <div className="mt-4 rounded-xl border border-[var(--admin-line)] bg-white/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Diff vs {compareLabel}</h3>
              <button
                type="button"
                className="text-xs text-[var(--admin-muted)] underline"
                onClick={() => {
                  setCompareId(null);
                  setComparePayload(null);
                }}
              >
                Close
              </button>
            </div>
            {liveDiff.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--admin-muted)]">No differences.</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">
                {liveDiff.map((row) => (
                  <li key={row.path} className="rounded-lg border border-[var(--admin-line)] p-2">
                    <p className="font-mono font-semibold">{row.path}</p>
                    <p className="text-emerald-800">Draft: {row.draft}</p>
                    <p className="text-[var(--admin-muted)]">{compareLabel}: {row.other}</p>
                  </li>
                ))}
              </ul>
            )}
            {compareId && compareId !== "published" ? (
              <p className="mt-2 text-[10px] text-[var(--admin-muted)]">Comparing revision id {compareId}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {confirmPublish ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-confirm-title"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-[var(--admin-card)] p-5 shadow-xl">
            <h2 id="publish-confirm-title" className="text-lg font-semibold">
              Publish this draft?
            </h2>
            <p className="text-sm text-[var(--admin-muted)]">
              Revision will become the live public content for <code>{documentKey}</code>. OWNER-only action. Draft
              preview is not public until this confirms.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[var(--admin-line)] px-4 py-2 text-sm font-semibold"
                onClick={() => setConfirmPublish(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[#fff8f4]"
                onClick={doPublish}
              >
                Confirm publish
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
