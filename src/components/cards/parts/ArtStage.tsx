import type { ReactNode } from "react";

/** Artwork box sized from its own container so art never sits under the greeting panel. */
export function ArtStage({ ratio, maxRem = 26, children, className = "" }: { ratio: number; maxRem?: number; children: ReactNode; className?: string }) {
  return (
    <div className={`min-h-0 w-full flex-1 px-4 pt-14 ${className}`} style={{ containerType: "size" }}>
      <div className="mx-auto grid size-full place-items-center">
        <div className="relative" style={{ aspectRatio: String(ratio), width: `min(100cqw, 100cqh * ${ratio}, ${maxRem}rem)` }}>{children}</div>
      </div>
    </div>
  );
}
