import { notFound } from "next/navigation";
import { CinemaLab } from "@/components/lab/CinemaLab";

/** Cinematic card prototype viewer (development only, like /lab/lumi). 404 in production unless ENABLE_LAB=1. */
export const instant = false;

export default function CinemaLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_LAB !== "1") notFound();
  return <CinemaLab />;
}
