import { notFound } from "next/navigation";
import { ArLab } from "@/components/cards/premium3d/ar/ArLab";

/** AR model lab: exports and previews the generic AR gift (development only, like /lab/card). 404 in production unless ENABLE_LAB=1. */
export const instant = false;

export default function ArLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_LAB !== "1") notFound();
  return <ArLab />;
}
