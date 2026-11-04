"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import dynamic from "next/dynamic";

// The card player (and its scene) is only downloaded when the preview is opened.
const CardPlayer = dynamic(() => import("@/components/cards/CardPlayer").then((m) => m.CardPlayer), { ssr: false });

/** "Watch the Magic" trigger plus a native <dialog> (focus trap, Esc, focus restore built in). */
export function WatchMagic() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <Button variant="secondary" onClick={show} aria-haspopup="dialog">
        <svg aria-hidden viewBox="0 0 20 20" className="size-4 fill-current"><path d="M6 4l10 6-10 6z" /></svg>
        Watch the Magic
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="magic-title"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && close()}
        className="m-auto max-h-[92dvh] w-[min(92vw,30rem)] overflow-y-auto rounded-[2rem] bg-ivory p-0 text-midnight shadow-lift backdrop:bg-midnight/60 backdrop:backdrop-blur-sm"
      >
        <div className="relative px-6 pb-8 pt-6 sm:px-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 id="magic-title" className="font-display text-2xl">A card, brought to life</h2>
            <button type="button" onClick={close} aria-label="Close preview" className="grid size-10 place-items-center rounded-full hover:bg-midnight/5">
              <svg aria-hidden viewBox="0 0 20 20" className="size-5 stroke-current" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
            </button>
          </div>
          {open && (
            <>
              <div className="mx-auto aspect-[9/16] max-h-[68dvh] overflow-hidden rounded-[2rem] bg-midnight shadow-lift" style={{ maxWidth: "min(100%, 22rem)" }}>
                <CardPlayer compact card={{ templateKey: "snow-globe", recipientName: "Ava", senderName: "Sam", message: "Wishing you warmth, joy and a little magic this Christmas." }} />
              </div>
              <p className="mt-4 text-center text-sm text-ink-soft">Sample card. Names and message are examples only.</p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
