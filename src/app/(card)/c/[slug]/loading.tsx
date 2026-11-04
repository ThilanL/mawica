/** Never a blank screen while a card loads: plum backdrop with a gentle star. */
export default function CardLoading() {
  return (
    <div role="status" aria-label="Opening your card" className="grid h-dvh place-items-center bg-[radial-gradient(120%_80%_at_50%_20%,#5b3d8f,#2a1b3d_70%)] text-gold">
      <svg viewBox="0 0 40 40" aria-hidden className="cc-tw size-14 drop-shadow-[0_0_24px_rgb(244_195_113/0.8)]"><path fill="currentColor" d="M20 0c1 11 3 16 9 17-6 1-8 6-9 23-1-17-3-22-9-23 6-1 8-6 9-17Z" /></svg>
      <span className="sr-only">Opening your card</span>
    </div>
  );
}
