import type { ReactNode } from "react";

/** Owner-review banner. Remove only after the owner/legal counsel has approved the text. */
export function LegalDraftBanner() {
  return (
    <div role="note" className="mb-10 rounded-2xl border border-gold/60 bg-[#fff3d9] px-5 py-4 text-sm text-midnight">
      <strong>Draft for owner and legal review. Not yet approved for publication.</strong> Items in{" "}
      <mark className="bg-gold/50 px-1">[square brackets]</mark> must be supplied or confirmed before launch. This text describes how the
      product works today; it is not legal advice.
    </div>
  );
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
      <LegalDraftBanner />
      <h1 className="font-display text-4xl sm:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-ink-soft">Last updated: {updated}</p>
      <div className="mt-10 space-y-8 text-lg leading-relaxed text-midnight/90 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc [&_li]:py-0.5">
        {children}
      </div>
    </article>
  );
}

export const Todo = ({ children }: { children: ReactNode }) => <mark className="bg-gold/50 px-1">[{children}]</mark>;
