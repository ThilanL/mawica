"use client";

import { useState } from "react";
import { getTemplate, isPremiumTemplateKey } from "@/modules/templates/registry";
import { premiumScenes, scenes } from "./scenes";
import type { CardData } from "./types";

/** Renders a card scene with a replay control. Used for preview and the recipient view. */
export function CardPlayer({ card, compact = false }: { card: CardData; compact?: boolean }) {
  const [replayKey, setReplayKey] = useState(0);
  const Scene = isPremiumTemplateKey(card.templateKey) ? premiumScenes[card.templateKey] : scenes[card.templateKey]; // module-level maps: no component is created during render
  const t = getTemplate(card.templateKey);
  return (
    <div className="relative size-full">
      <Scene {...card} greeting={t.greeting} replayKey={replayKey} compact={compact} />
      <button
        type="button"
        onClick={() => setReplayKey((k) => k + 1)}
        className="absolute right-3 top-3 z-20 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-ivory backdrop-blur ring-1 ring-white/25 hover:bg-white/25"
      >
        Replay
      </button>
    </div>
  );
}
