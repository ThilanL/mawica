"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RemoveCardForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const reason = String(fd.get("reason") || "").trim();
        setError(null);
        start(async () => {
          const res = await fetch("/api/moderation/remove", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ slug, reason }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            setError(body?.error || "Remove failed");
            return;
          }
          router.refresh();
        });
      }}
    >
      <input
        name="reason"
        required
        maxLength={200}
        placeholder="Removal reason"
        className="w-full min-w-[12rem] rounded-lg border border-[var(--admin-line)] px-2 py-1.5 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[#30123] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Removing…" : "Soft-remove"}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </form>
  );
}
