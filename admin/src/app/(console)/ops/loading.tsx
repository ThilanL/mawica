export default function OpsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading operations">
      <div className="h-8 w-64 animate-pulse rounded bg-black/10" />
      <div className="h-28 animate-pulse rounded-2xl bg-black/5" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-black/5" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-black/5" />
    </div>
  );
}
