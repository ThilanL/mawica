export default function CustomersLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading customers">
      <div className="h-8 w-48 animate-pulse rounded bg-black/10" />
      <div className="h-24 animate-pulse rounded-2xl bg-black/5" />
      <div className="h-64 animate-pulse rounded-2xl bg-black/5" />
    </div>
  );
}
