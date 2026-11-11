import { notFound } from "next/navigation";
import { CardLab } from "@/components/lab/CardLab";

/** Card scene viewer (development only, like /lab/lumi). 404 in production unless ENABLE_LAB=1. */
export const instant = false;

export default function CardLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_LAB !== "1") notFound();
  return <CardLab />;
}
