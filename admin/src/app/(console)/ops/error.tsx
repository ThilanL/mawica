"use client";

export default function OpsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-semibold text-red-900">Could not load operations analytics</h2>
      <p className="mt-2 text-sm text-red-800">{error.message || "Unexpected error"}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[#fff8f4]"
      >
        Try again
      </button>
    </div>
  );
}
