import { notFound } from "next/navigation";
import { GlobeLab } from "@/components/cards/premium3d/stage/cards/globe/GlobeLab";

/** 360° snow globe viewer and review-render rig (development only, like /lab/card). 404 in production unless ENABLE_LAB=1. */
export const instant = false;

export default function GlobeLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_LAB !== "1") notFound();
  return <GlobeLab />;
}
