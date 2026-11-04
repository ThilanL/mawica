import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardPlayer } from "@/components/cards/CardPlayer";
import { ReportCard } from "@/components/cards/ReportCard";
import { getPublishedCard } from "@/modules/cards/service";
import { isTemplateKey } from "@/modules/templates/registry";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { alternates: { canonical: `/c/${slug}` } }; // no database lookup, no personal text
}

// No loading.tsx on purpose: it would stream a spinner first and put the card in a hidden, JS-swapped block,
// breaking the no-JavaScript experience. The lookup is one indexed query, so the document arrives complete.
// Blocking (non-streamed) route on purpose: the lookup is a single indexed query and
// blocking lets removed/unknown cards return a real HTTP 404 instead of a streamed 200.
export const instant = false;

export default async function CardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Uncached lookup before any Suspense boundary: removed cards give a real 404, never a stale page.
  const card = await getPublishedCard(slug);
  if (!card || !isTemplateKey(card.templateKey)) notFound();

  return (
    <div className="relative h-dvh bg-midnight">
      <CardPlayer card={{ ...card, templateKey: card.templateKey }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex items-center justify-center gap-4 pb-[env(safe-area-inset-bottom)]">
        <Link href="/create" className="pointer-events-auto text-sm text-ivory/70 underline underline-offset-4 hover:text-ivory">Make your own</Link>
        <span className="pointer-events-auto"><ReportCard slug={card.slug} /></span>
      </div>
    </div>
  );
}
