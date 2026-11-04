import { notFound } from "next/navigation";
import { LumiLab } from "@/components/lab/LumiLab";

/**
 * Lumi prototype (isolated, development only). The route returns 404 in production unless
 * ENABLE_LAB=1 is set, and nothing on the public site imports this code or Three.js.
 */
export const instant = false;

export default function LumiLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_LAB !== "1") notFound();
  return <LumiLab />;
}
