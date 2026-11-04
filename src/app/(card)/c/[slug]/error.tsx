"use client";

export default function CardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-midnight px-6 text-center text-ivory">
      <div>
        <h1 className="font-display text-3xl">We couldn&rsquo;t open this card</h1>
        <p className="mt-3 text-ivory/75">Please check your connection and try again.</p>
        <button type="button" onClick={reset} className="mt-6 rounded-full bg-ivory px-6 py-3 font-semibold text-midnight">Try again</button>
      </div>
    </div>
  );
}
