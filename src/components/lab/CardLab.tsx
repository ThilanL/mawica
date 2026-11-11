"use client";

import { createElement, useEffect, useState } from "react";
import { CardPlayer } from "@/components/cards/CardPlayer";
import { sceneFor } from "@/components/cards/scenes";
import { isAnyTemplateKey } from "@/modules/templates/registry";

/** Plays any card scene with sample text: /lab/card?key=snow-globe&to=Nadia&from=Sam&msg=... (the scene reads its own debug switches from the URL). */
export function CardLab() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  useEffect(() => { setQ(new URLSearchParams(window.location.search)); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- read once on the client
  if (!q) return null;
  const key = q.get("key") ?? "snow-globe";
  if (!isAnyTemplateKey(key)) return <p className="p-6">Unknown card</p>;
  if (q.has("bare")) { return <div className="h-dvh w-full">{createElement(sceneFor(key), { recipientName: "", senderName: "", message: "", greeting: "", replayKey: 0 })}</div>; } // thumbnail renders: the scene only, no player chrome
  return (
    <div className="h-dvh w-full">
      <CardPlayer card={{ templateKey: key, recipientName: q.get("to") ?? "Nadia", senderName: q.get("from") ?? "Sam", message: q.get("msg") ?? "Wishing you warmth, joy and a little magic this season. May every day ahead feel as bright as tonight." }} />
    </div>
  );
}
