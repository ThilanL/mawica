import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public pages are indexable. Cards are private links (also noindex via meta/header) and the API is off-limits.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/c/", "/api/"] }], sitemap: `${SITE_URL}/sitemap.xml` };
}
