"use client";

import { MediaPicker } from "@/components/cms/MediaPicker";
import { Field, SectionCard, TextInput, Toggle } from "@/components/cms/formFields";
import type {
  CampaignPayload,
  FooterPayload,
  HeroPayload,
  HomeSectionsPayload,
  LegalPayload,
  NavPayload,
  SeoPayload,
} from "@mawica/modules/cms";

export type FieldErrors = Record<string, string>;

function err(errors: FieldErrors, path: string) {
  return errors[path];
}

function setAt<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  const parts = path.split(".");
  const next = structuredClone(obj) as Record<string, unknown>;
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const idx = Number(p);
    if (!Number.isNaN(idx) && Array.isArray(cur[parts[i - 1] as string])) {
      // handled via parent arrays below — keep simple path updates in callers
    }
    const child = cur[p];
    if (!child || typeof child !== "object") cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
  return next as T;
}

/** Schema-driven structured editors — one panel per document key. */
export function DocumentForm({
  documentKey,
  value,
  onChange,
  errors,
  disabled,
}: {
  documentKey: string;
  value: unknown;
  onChange: (next: unknown) => void;
  errors: FieldErrors;
  disabled?: boolean;
}) {
  switch (documentKey) {
    case "home.hero":
      return <HeroForm value={value as HeroPayload} onChange={onChange} errors={errors} disabled={disabled} />;
    case "home.sections":
      return (
        <SectionsForm value={value as HomeSectionsPayload} onChange={onChange} errors={errors} disabled={disabled} />
      );
    case "site.nav":
      return <NavForm value={value as NavPayload} onChange={onChange} errors={errors} disabled={disabled} />;
    case "site.footer":
      return <FooterForm value={value as FooterPayload} onChange={onChange} errors={errors} disabled={disabled} />;
    case "legal.privacy":
    case "legal.terms":
      return <LegalForm value={value as LegalPayload} onChange={onChange} errors={errors} disabled={disabled} />;
    case "seo.site":
      return <SeoForm value={value as SeoPayload} onChange={onChange} errors={errors} disabled={disabled} />;
    case "campaign.christmas":
    case "campaign.newyear":
      return (
        <CampaignForm value={value as CampaignPayload} onChange={onChange} errors={errors} disabled={disabled} />
      );
    default:
      return <p className="text-sm text-red-700">Unknown document key</p>;
  }
}

function HeroForm({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: HeroPayload;
  onChange: (v: unknown) => void;
  errors: FieldErrors;
  disabled?: boolean;
}) {
  const patch = (path: string, v: unknown) => onChange(setAt(value as unknown as Record<string, unknown>, path, v));
  return (
    <>
      <SectionCard title="Hero copy" description="First viewport headline and CTA.">
        <Field label="Eyebrow" error={err(errors, "eyebrow")}>
          <TextInput value={value.eyebrow} onChange={(v) => patch("eyebrow", v)} disabled={disabled} maxLength={120} />
        </Field>
        <Field label="Title line 1" error={err(errors, "titleLines.0")}>
          <TextInput
            value={value.titleLines[0]}
            onChange={(v) => onChange({ ...value, titleLines: [v, value.titleLines[1]] })}
            disabled={disabled}
            maxLength={120}
          />
        </Field>
        <Field label="Title line 2" error={err(errors, "titleLines.1")}>
          <TextInput
            value={value.titleLines[1]}
            onChange={(v) => onChange({ ...value, titleLines: [value.titleLines[0], v] })}
            disabled={disabled}
            maxLength={120}
          />
        </Field>
        <Field label="Body" error={err(errors, "body")}>
          <TextInput value={value.body} onChange={(v) => patch("body", v)} disabled={disabled} maxLength={800} multiline />
        </Field>
        <Field label="CTA label" error={err(errors, "cta")}>
          <TextInput value={value.cta} onChange={(v) => patch("cta", v)} disabled={disabled} maxLength={80} />
        </Field>
      </SectionCard>
      <SectionCard title="Annotation" description="Three short phrases beside the hero.">
        {value.annotation.map((a, i) => (
          <Field key={i} label={`Line ${i + 1}`} error={err(errors, `annotation.${i}`)}>
            <TextInput
              value={a}
              onChange={(v) => {
                const annotation = [...value.annotation] as [string, string, string];
                annotation[i] = v;
                onChange({ ...value, annotation });
              }}
              disabled={disabled}
              maxLength={80}
            />
          </Field>
        ))}
      </SectionCard>
      <SectionCard title="Benefit pills">
        {value.benefits.map((b, i) => (
          <Field key={b.id} label={`${b.id} label`} error={err(errors, `benefits.${i}.label`)}>
            <TextInput
              value={b.label}
              onChange={(v) => {
                const benefits = value.benefits.map((x, j) => (j === i ? { ...x, label: v } : x));
                onChange({ ...value, benefits });
              }}
              disabled={disabled}
              maxLength={80}
            />
          </Field>
        ))}
      </SectionCard>
    </>
  );
}

function SectionsForm({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: HomeSectionsPayload;
  onChange: (v: unknown) => void;
  errors: FieldErrors;
  disabled?: boolean;
}) {
  const str = (key: keyof HomeSectionsPayload, label: string, max: number, multiline = false) => (
    <Field label={label} error={err(errors, key)}>
      <TextInput
        value={String(value[key] ?? "")}
        onChange={(v) => onChange({ ...value, [key]: v })}
        disabled={disabled}
        maxLength={max}
        multiline={multiline}
      />
    </Field>
  );
  return (
    <>
      <SectionCard title="Gallery">
        {str("galleryEyebrow", "Eyebrow", 80)}
        {str("galleryTitle", "Title", 160)}
        {str("galleryBody", "Body", 800, true)}
        {str("galleryChristmasHeading", "Christmas heading", 120)}
        {str("galleryNewYearHeading", "New Year heading", 120)}
      </SectionCard>
      <SectionCard title="How it works">
        {str("howItWorksEyebrow", "Eyebrow", 80)}
        {str("howItWorksTitle", "Title", 160)}
        {str("howItWorksBody", "Body", 800, true)}
        {value.steps.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-[var(--admin-line)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">Step {i + 1}</p>
            <Field label="Number" error={err(errors, `steps.${i}.n`)}>
              <TextInput
                value={s.n}
                onChange={(v) => {
                  const steps = value.steps.map((x, j) => (j === i ? { ...x, n: v } : x));
                  onChange({ ...value, steps });
                }}
                disabled={disabled}
                maxLength={8}
              />
            </Field>
            <Field label="Title" error={err(errors, `steps.${i}.title`)}>
              <TextInput
                value={s.title}
                onChange={(v) => {
                  const steps = value.steps.map((x, j) => (j === i ? { ...x, title: v } : x));
                  onChange({ ...value, steps });
                }}
                disabled={disabled}
                maxLength={80}
              />
            </Field>
            <Field label="Body" error={err(errors, `steps.${i}.body`)}>
              <TextInput
                value={s.body}
                onChange={(v) => {
                  const steps = value.steps.map((x, j) => (j === i ? { ...x, body: v } : x));
                  onChange({ ...value, steps });
                }}
                disabled={disabled}
                maxLength={400}
                multiline
              />
            </Field>
          </div>
        ))}
      </SectionCard>
      <SectionCard title="Meet Lumi">
        {str("meetLumiEyebrow", "Eyebrow", 80)}
        {str("meetLumiTitle", "Title", 160)}
        {str("meetLumiBody", "Body", 800, true)}
      </SectionCard>
      <SectionCard title="Benefits">
        {str("benefitsEyebrow", "Eyebrow", 80)}
        {str("benefitsTitle", "Title", 160)}
        {value.benefits.map((b, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-[var(--admin-line)] p-3">
            <Field label="Title" error={err(errors, `benefits.${i}.title`)}>
              <TextInput
                value={b.title}
                onChange={(v) => {
                  const benefits = value.benefits.map((x, j) => (j === i ? { ...x, title: v } : x));
                  onChange({ ...value, benefits });
                }}
                disabled={disabled}
                maxLength={80}
              />
            </Field>
            <Field label="Body" error={err(errors, `benefits.${i}.body`)}>
              <TextInput
                value={b.body}
                onChange={(v) => {
                  const benefits = value.benefits.map((x, j) => (j === i ? { ...x, body: v } : x));
                  onChange({ ...value, benefits });
                }}
                disabled={disabled}
                maxLength={400}
                multiline
              />
            </Field>
          </div>
        ))}
      </SectionCard>
      <SectionCard title="Recipient + final CTA">
        {str("recipientEyebrow", "Recipient eyebrow", 80)}
        {str("recipientTitle", "Recipient title", 160)}
        {str("recipientBody", "Recipient body", 800, true)}
        {str("finalCtaTitle", "Final CTA title", 160)}
        {str("finalCtaBody", "Final CTA body", 800, true)}
        {str("finalCtaLabel", "Final CTA label", 80)}
      </SectionCard>
    </>
  );
}

function NavForm({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: NavPayload;
  onChange: (v: unknown) => void;
  errors: FieldErrors;
  disabled?: boolean;
}) {
  return (
    <SectionCard title="Primary navigation">
      <Field label="Create CTA" error={err(errors, "createCta")}>
        <TextInput
          value={value.createCta}
          onChange={(v) => onChange({ ...value, createCta: v })}
          disabled={disabled}
          maxLength={80}
        />
      </Field>
      <Field label="Search aria label" error={err(errors, "searchAriaLabel")}>
        <TextInput
          value={value.searchAriaLabel}
          onChange={(v) => onChange({ ...value, searchAriaLabel: v })}
          disabled={disabled}
          maxLength={120}
        />
      </Field>
      <Field label="Search href" error={err(errors, "searchHref")} hint="Relative path or https://mawica.com…">
        <TextInput
          value={value.searchHref}
          onChange={(v) => onChange({ ...value, searchHref: v })}
          disabled={disabled}
          maxLength={300}
        />
      </Field>
      {value.links.map((link, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-[var(--admin-line)] p-3 sm:grid-cols-2">
          <Field label={`Link ${i + 1} label`} error={err(errors, `links.${i}.label`)}>
            <TextInput
              value={link.label}
              onChange={(v) => {
                const links = value.links.map((x, j) => (j === i ? { ...x, label: v } : x));
                onChange({ ...value, links });
              }}
              disabled={disabled}
              maxLength={80}
            />
          </Field>
          <Field label="Href" error={err(errors, `links.${i}.href`)}>
            <TextInput
              value={link.href}
              onChange={(v) => {
                const links = value.links.map((x, j) => (j === i ? { ...x, href: v } : x));
                onChange({ ...value, links });
              }}
              disabled={disabled}
              maxLength={300}
            />
          </Field>
        </div>
      ))}
      {value.links.length < 12 && !disabled ? (
        <button
          type="button"
          className="rounded-full border border-[var(--admin-line)] px-3 py-1.5 text-xs font-semibold"
          onClick={() => onChange({ ...value, links: [...value.links, { label: "New link", href: "/" }] })}
        >
          Add link
        </button>
      ) : null}
    </SectionCard>
  );
}

function FooterForm({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: FooterPayload;
  onChange: (v: unknown) => void;
  errors: FieldErrors;
  disabled?: boolean;
}) {
  return (
    <SectionCard title="Footer">
      <Field label="Tagline" error={err(errors, "tagline")}>
        <TextInput
          value={value.tagline}
          onChange={(v) => onChange({ ...value, tagline: v })}
          disabled={disabled}
          maxLength={500}
          multiline
        />
      </Field>
      <Field label="Copyright" error={err(errors, "copyright")}>
        <TextInput
          value={value.copyright}
          onChange={(v) => onChange({ ...value, copyright: v })}
          disabled={disabled}
          maxLength={160}
        />
      </Field>
      <Field label="Domain label" error={err(errors, "domainLabel")}>
        <TextInput
          value={value.domainLabel}
          onChange={(v) => onChange({ ...value, domainLabel: v })}
          disabled={disabled}
          maxLength={80}
        />
      </Field>
      {value.columns.map((col, ci) => (
        <div key={ci} className="space-y-2 rounded-xl border border-[var(--admin-line)] p-3">
          <Field label={`Column ${ci + 1} title`} error={err(errors, `columns.${ci}.title`)}>
            <TextInput
              value={col.title}
              onChange={(v) => {
                const columns = value.columns.map((x, j) => (j === ci ? { ...x, title: v } : x));
                onChange({ ...value, columns });
              }}
              disabled={disabled}
              maxLength={80}
            />
          </Field>
          {col.links.map((link, li) => (
            <div key={li} className="grid gap-2 sm:grid-cols-2">
              <Field label="Label" error={err(errors, `columns.${ci}.links.${li}.label`)}>
                <TextInput
                  value={link.label}
                  onChange={(v) => {
                    const columns = value.columns.map((c, j) =>
                      j === ci
                        ? { ...c, links: c.links.map((l, k) => (k === li ? { ...l, label: v } : l)) }
                        : c,
                    );
                    onChange({ ...value, columns });
                  }}
                  disabled={disabled}
                  maxLength={80}
                />
              </Field>
              <Field label="Href" error={err(errors, `columns.${ci}.links.${li}.href`)}>
                <TextInput
                  value={link.href}
                  onChange={(v) => {
                    const columns = value.columns.map((c, j) =>
                      j === ci
                        ? { ...c, links: c.links.map((l, k) => (k === li ? { ...l, href: v } : l)) }
                        : c,
                    );
                    onChange({ ...value, columns });
                  }}
                  disabled={disabled}
                  maxLength={300}
                />
              </Field>
            </div>
          ))}
        </div>
      ))}
    </SectionCard>
  );
}

function LegalForm({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: LegalPayload;
  onChange: (v: unknown) => void;
  errors: FieldErrors;
  disabled?: boolean;
}) {
  return (
    <SectionCard title="Legal document">
      <Field label="Title" error={err(errors, "title")}>
        <TextInput
          value={value.title}
          onChange={(v) => onChange({ ...value, title: v })}
          disabled={disabled}
          maxLength={160}
        />
      </Field>
      <Field label="Updated label" error={err(errors, "updated")}>
        <TextInput
          value={value.updated}
          onChange={(v) => onChange({ ...value, updated: v })}
          disabled={disabled}
          maxLength={120}
        />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--admin-line)] px-3 py-2">
        <span className="text-sm font-medium">Show draft banner</span>
        <Toggle
          label="Show draft banner"
          checked={value.showDraftBanner}
          onChange={(v) => onChange({ ...value, showDraftBanner: v })}
          disabled={disabled}
        />
      </div>
      {value.sections.map((sec, si) => (
        <div key={si} className="space-y-2 rounded-xl border border-[var(--admin-line)] p-3">
          <Field label={`Section ${si + 1} heading`} error={err(errors, `sections.${si}.heading`)}>
            <TextInput
              value={sec.heading}
              onChange={(v) => {
                const sections = value.sections.map((x, j) => (j === si ? { ...x, heading: v } : x));
                onChange({ ...value, sections });
              }}
              disabled={disabled}
              maxLength={160}
            />
          </Field>
          {sec.paragraphs.map((p, pi) => (
            <Field key={pi} label={`Paragraph ${pi + 1}`} error={err(errors, `sections.${si}.paragraphs.${pi}`)}>
              <TextInput
                value={p}
                onChange={(v) => {
                  const sections = value.sections.map((x, j) =>
                    j === si
                      ? { ...x, paragraphs: x.paragraphs.map((pp, k) => (k === pi ? v : pp)) }
                      : x,
                  );
                  onChange({ ...value, sections });
                }}
                disabled={disabled}
                maxLength={4000}
                multiline
                rows={4}
              />
            </Field>
          ))}
        </div>
      ))}
    </SectionCard>
  );
}

function SeoForm({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: SeoPayload;
  onChange: (v: unknown) => void;
  errors: FieldErrors;
  disabled?: boolean;
}) {
  const fields: Array<[keyof SeoPayload, string, number]> = [
    ["titleDefault", "Default title", 160],
    ["description", "Description", 320],
    ["ogTitle", "Open Graph title", 160],
    ["ogDescription", "Open Graph description", 320],
    ["twitterTitle", "Twitter title", 160],
    ["twitterDescription", "Twitter description", 320],
  ];
  return (
    <SectionCard title="SEO & social metadata">
      {fields.map(([key, label, max]) => (
        <Field key={key} label={label} error={err(errors, key)}>
          <TextInput
            value={value[key]}
            onChange={(v) => onChange({ ...value, [key]: v })}
            disabled={disabled}
            maxLength={max}
            multiline={max > 200}
          />
        </Field>
      ))}
    </SectionCard>
  );
}

function CampaignForm({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: CampaignPayload;
  onChange: (v: unknown) => void;
  errors: FieldErrors;
  disabled?: boolean;
}) {
  return (
    <>
      <SectionCard
        title="Campaign schedule"
        description="Timezone-aware window. Public display requires published state, visibility on, and now within the window."
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--admin-line)] px-3 py-2">
          <div>
            <p className="text-sm font-medium">Section visible</p>
            <p className="text-xs text-[var(--admin-muted)]">When off, the campaign banner stays hidden even inside the schedule.</p>
          </div>
          <Toggle
            label="Section visible"
            checked={value.sectionVisible}
            onChange={(v) => onChange({ ...value, sectionVisible: v })}
            disabled={disabled}
          />
        </div>
        <Field label="Starts at (ISO with offset)" error={err(errors, "startsAt")} hint="e.g. 2026-11-01T00:00:00+11:00">
          <TextInput
            value={value.startsAt}
            onChange={(v) => onChange({ ...value, startsAt: v })}
            disabled={disabled}
            maxLength={40}
          />
        </Field>
        <Field label="Ends at (ISO with offset)" error={err(errors, "endsAt")}>
          <TextInput
            value={value.endsAt}
            onChange={(v) => onChange({ ...value, endsAt: v })}
            disabled={disabled}
            maxLength={40}
          />
        </Field>
        {err(errors, "(root)") ? <p className="text-xs text-red-700">{err(errors, "(root)")}</p> : null}
        <p className="text-xs text-[var(--admin-muted)]">
          Season <code>{value.season}</code> · Anchor <code>#{value.anchorId}</code> (fixed for this document)
        </p>
      </SectionCard>
      <SectionCard title="Campaign content">
        <Field label="Title" error={err(errors, "title")}>
          <TextInput
            value={value.title}
            onChange={(v) => onChange({ ...value, title: v })}
            disabled={disabled}
            maxLength={160}
          />
        </Field>
        <Field label="Description" error={err(errors, "description")}>
          <TextInput
            value={value.description}
            onChange={(v) => onChange({ ...value, description: v })}
            disabled={disabled}
            maxLength={800}
            multiline
          />
        </Field>
        <Field label="CTA label" error={err(errors, "ctaLabel")}>
          <TextInput
            value={value.ctaLabel}
            onChange={(v) => onChange({ ...value, ctaLabel: v })}
            disabled={disabled}
            maxLength={80}
          />
        </Field>
        <Field label="CTA href" error={err(errors, "ctaHref")}>
          <TextInput
            value={value.ctaHref}
            onChange={(v) => onChange({ ...value, ctaHref: v })}
            disabled={disabled}
            maxLength={300}
          />
        </Field>
        <div className="space-y-2">
          <p className="text-sm font-medium">Media</p>
          <MediaPicker
            value={value.mediaAssetId}
            onChange={(id) => onChange({ ...value, mediaAssetId: id })}
            disabled={disabled}
          />
          {err(errors, "mediaAssetId") ? (
            <p className="text-xs text-red-700">{err(errors, "mediaAssetId")}</p>
          ) : null}
        </div>
      </SectionCard>
    </>
  );
}
