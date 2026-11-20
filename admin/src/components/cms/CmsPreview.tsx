"use client";

import { useState } from "react";
import type { CampaignPayload, HeroPayload, NavPayload } from "@mawica/modules/cms";

/**
 * Authenticated draft preview only — renders from in-memory draft state in the admin session.
 * Never hits a public unpublished endpoint.
 */
export function CmsPreview({ documentKey, payload }: { documentKey: string; payload: unknown }) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const width = viewport === "desktop" ? "100%" : "390px";

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Draft preview</h2>
          <p className="text-xs text-[var(--admin-muted)]">
            Staff-only. Unpublished content is not served on public routes.
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-[var(--admin-line)] p-0.5">
          {(["desktop", "mobile"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewport(v)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                viewport === v ? "bg-[var(--admin-accent)] text-[#fff8f4]" : "text-[var(--admin-muted)]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl bg-[var(--admin-bg)] p-4">
        <div
          className="mx-auto overflow-hidden rounded-xl border border-[var(--admin-line)] bg-white shadow-sm"
          style={{ width, maxWidth: "100%" }}
        >
          <PreviewBody documentKey={documentKey} payload={payload} />
        </div>
      </div>
    </section>
  );
}

function PreviewBody({ documentKey, payload }: { documentKey: string; payload: unknown }) {
  if (!payload || typeof payload !== "object") {
    return <p className="p-6 text-sm text-[var(--admin-muted)]">Invalid draft</p>;
  }
  const p = payload as Record<string, unknown>;

  if (documentKey === "home.hero") {
    const h = p as unknown as HeroPayload;
    return (
      <div className="space-y-3 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lavender" style={{ color: "#a63d78" }}>
          {h.eyebrow}
        </p>
        <h3 className="font-display text-3xl leading-tight">
          {h.titleLines[0]}
          <br />
          {h.titleLines[1]}
        </h3>
        <p className="text-sm text-[var(--admin-muted)]">{h.body}</p>
        <span className="inline-flex rounded-full bg-[var(--admin-accent)] px-4 py-2 text-xs font-semibold text-[#fff8f4]">
          {h.cta}
        </span>
      </div>
    );
  }

  if (documentKey === "site.nav") {
    const n = p as unknown as NavPayload;
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--admin-line)] px-4 py-3 text-sm">
        <span className="font-semibold">mawica.</span>
        {n.links.map((l) => (
          <span key={l.href + l.label} className="text-[var(--admin-muted)]">
            {l.label}
          </span>
        ))}
        <span className="ml-auto rounded-full bg-[var(--admin-accent)] px-3 py-1 text-xs font-semibold text-[#fff8f4]">
          {n.createCta}
        </span>
      </div>
    );
  }

  if (documentKey.startsWith("campaign.")) {
    const c = p as unknown as CampaignPayload;
    return (
      <div className="space-y-3 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#6c4fb5" }}>
          Seasonal campaign
        </p>
        <h3 className="font-display text-2xl">{c.title}</h3>
        <p className="text-sm text-[var(--admin-muted)]">{c.description}</p>
        <span className="inline-flex rounded-full bg-midnight px-4 py-2 text-xs font-semibold text-white">
          {c.ctaLabel}
        </span>
        {c.mediaAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/cms/media/${c.mediaAssetId}/file?variant=thumb`}
            alt=""
            className="mt-2 max-h-36 rounded-lg object-contain"
          />
        ) : null}
        <p className="text-[10px] text-[var(--admin-muted)]">
          Visible={String(c.sectionVisible)} · {c.startsAt} → {c.endsAt}
        </p>
      </div>
    );
  }

  if (documentKey === "seo.site") {
    return (
      <div className="space-y-2 p-6 text-sm">
        <p className="font-semibold">{String(p.titleDefault ?? "")}</p>
        <p className="text-[var(--admin-muted)]">{String(p.description ?? "")}</p>
        <p className="text-xs text-[var(--admin-muted)]">OG: {String(p.ogTitle ?? "")}</p>
      </div>
    );
  }

  // Generic readable preview for sections / footer / legal
  return (
    <div className="max-h-[28rem] space-y-2 overflow-y-auto p-6 text-sm">
      {Object.entries(p)
        .slice(0, 24)
        .map(([k, v]) => (
          <div key={k}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--admin-muted)]">{k}</p>
            <p className="whitespace-pre-wrap break-words">
              {typeof v === "string" ? v : JSON.stringify(v, null, 0).slice(0, 240)}
            </p>
          </div>
        ))}
    </div>
  );
}
