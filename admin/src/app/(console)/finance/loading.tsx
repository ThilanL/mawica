export default function FinanceLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading finance plan">
      <div className="h-8 w-56 animate-pulse rounded bg-black/10" />
      <div className="h-40 animate-pulse rounded-2xl bg-black/5" />
      <div className="grid gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}
