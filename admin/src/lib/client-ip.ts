import "server-only";

/** Admin sits behind fewer hops locally; still fail closed without XFF trust config. */
export function requestIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first || null;
}
