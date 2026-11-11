import { useMemo, useSyncExternalStore } from "react";

const subscribeNone = () => () => {};
const NONE: string[] = [];
let cached: string[] | null = null;
const none = () => NONE;
function browserZones(): string[] {
  if (cached) return cached;
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    cached = here ? [...list, here] : list;
  } catch { cached = NONE; }
  return cached;
}
const browserZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/** Zone list from the browser only (the server snapshot is empty, so hydration never compares different lists). */
export function useTimeZones(extra: string[] = []): string[] {
  const zones = useSyncExternalStore(subscribeNone, browserZones, none);
  return useMemo(() => [...new Set(["UTC", ...extra, ...zones])].sort(), [zones, extra]);
}
export const useBrowserZone = (): string => useSyncExternalStore(subscribeNone, browserZone, () => "UTC");
