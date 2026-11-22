export default function CustomerDetailLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading customer">
      <div className="h-4 w-24 animate-pulse rounded bg-black/10" />
      <div className="h-8 w-64 animate-pulse rounded bg-black/10" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-black/5" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl bg-black/5" />
    </div>
  );
}
