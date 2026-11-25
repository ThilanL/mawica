import type { MetadataRoute } from "next";
import { isNoindex, SITE_URL } from "@/lib/site";

// Staging (MAWICA_NOINDEX=1) lists nothing.
export default function sitemap(): MetadataRoute.Sitemap {
  if (isNoindex()) return [];
  return ["/", "/about", "/create", "/privacy", "/terms"].map((p) => ({ url: `${SITE_URL}${p === "/" ? "" : p}`, changeFrequency: p === "/" ? "weekly" : "monthly" }));
}
