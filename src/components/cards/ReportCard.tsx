"use client";

import { useRef, useState } from "react";

export function ReportCard({ slug }: { slug: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch(`/api/cards/${slug}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: f.get("reason"), details: f.get("details") || undefined }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="text-sm text-ivory/70 underline underline-offset-4 hover:text-ivory">
        Report this card
      </button>
      <dialog ref={dialog} aria-labelledby="report-title" className="m-auto w-[min(92vw,26rem)] rounded-3xl bg-ivory p-6 text-midnight backdrop:bg-midnight/60">
        <form onSubmit={submit} className="space-y-4">
          <h2 id="report-title" className="font-display text-2xl">Report this card</h2>
          {state === "done" ? (
            <p role="status">Thank you. We&rsquo;ll review it.</p>
          ) : (
            <>
              <label className="block text-sm font-medium">Reason
                <select name="reason" required defaultValue="" className="mt-1 block w-full rounded-xl border border-midnight/25 bg-white px-3 py-2.5">
                  <option value="" disabled>Choose a reason</option>
                  <option value="INAPPROPRIATE">Inappropriate content</option>
                  <option value="HARASSMENT">Harassment or abuse</option>
                  <option value="SPAM">Spam or scam</option>
                  <option value="OTHER">Something else</option>
                </select>
              </label>
              <label className="block text-sm font-medium">Details (optional)
                <textarea name="details" maxLength={300} rows={3} className="mt-1 block w-full rounded-xl border border-midnight/25 bg-white px-3 py-2.5" />
              </label>
              {state === "error" && <p role="alert" className="text-sm text-[#a3254f]">Could not send the report. Please try again.</p>}
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { dialog.current?.close(); if (state === "done") setState("idle"); }} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-midnight/5">Close</button>
            {state !== "done" && <button type="submit" disabled={state === "sending"} className="rounded-full bg-midnight px-5 py-2 text-sm font-semibold text-ivory disabled:opacity-60">{state === "sending" ? "Sending…" : "Send report"}</button>}
          </div>
        </form>
      </dialog>
    </>
  );
}
