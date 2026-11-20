import type { MetadataRoute } from "next";
import { isNoindex, SITE_URL } from "@/lib/site";

// Public pages are indexable. Cards are private links (also noindex via meta/header) and the API is off-limits.
// Staging (MAWICA_NOINDEX=1): disallow everything and advertise no sitemap.
export default function robots(): MetadataRoute.Robots {
  if (isNoindex()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/c/", "/api/", "/lab/", "/account", "/sign-in"] }], sitemap: `${SITE_URL}/sitemap.xml` };
}
