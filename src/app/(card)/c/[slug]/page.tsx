import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArButton } from "@/components/cards/ArButton";
import { CardPlayer } from "@/components/cards/CardPlayer";
import { ReportCard } from "@/components/cards/ReportCard";
import { getPublishedCard } from "@/modules/cards/service";
import { getTemplate, isAnyTemplateKey } from "@/modules/templates/registry";

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
  if (!card || !isAnyTemplateKey(card.templateKey)) notFound();

  return (
    <div className="relative h-dvh bg-midnight">
      <CardPlayer card={{ templateKey: card.templateKey, recipientName: card.recipientName, senderName: card.senderName, message: card.message, media: card.media ? { kind: "image", src: `/api/media/${card.media.id}`, width: card.media.width, height: card.media.height } : null }} />
      {card.templateKey === "special-gift" && (
        // Beside Replay. Renders nothing unless the browser can start AR (Phase AR-1b: Android WebXR); the AR code loads only on tap.
        <div className="absolute right-[6.75rem] top-3 z-20">
          <ArButton wish={{ name: card.recipientName, greeting: getTemplate(card.templateKey).greeting, message: card.message, sender: card.senderName }} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex items-center justify-center gap-4 pb-[env(safe-area-inset-bottom)]">
        <Link href="/create" className="pointer-events-auto text-sm text-ivory/70 underline underline-offset-4 hover:text-ivory">Make your own</Link>
        <span className="pointer-events-auto"><ReportCard slug={card.slug} /></span>
      </div>
    </div>
  );
}
