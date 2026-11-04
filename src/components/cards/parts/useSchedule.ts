import { useEffect } from "react";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";

/**
 * Runs timed side effects (particle bursts) once per play; restarts on replay; skipped for reduced motion.
 * `steps` must only touch stable refs/handlers, so it is intentionally not an effect dependency.
 */
export function useSchedule(replayKey: number, steps: [number, () => void][]) {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const ids = steps.map(([ms, fn]) => window.setTimeout(fn, ms));
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey, reduced]);
}
