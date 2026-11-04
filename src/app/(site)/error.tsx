"use client";

import { Button } from "@/components/ui/Button";

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-center justify-center px-5 py-24 text-center">
      <h1 className="font-display text-4xl sm:text-5xl">Something went wrong</h1>
      <p className="mt-4 text-lg text-ink-soft">We couldn&rsquo;t load this page. Please try again.</p>
      <Button className="mt-8" onClick={reset}>Try again</Button>
    </section>
  );
}
