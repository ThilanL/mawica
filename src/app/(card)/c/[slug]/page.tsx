import Link from "next/link";
import { notFound } from "next/navigation";
import { CardPlayer } from "@/components/cards/CardPlayer";
import { ReportCard } from "@/components/cards/ReportCard";
import { getPublishedCard } from "@/modules/cards/service";
import { isTemplateKey } from "@/modules/templates/registry";

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
