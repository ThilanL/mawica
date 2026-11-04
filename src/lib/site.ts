/** Public site origin used for canonical URLs, OG tags, sitemap. Set NEXT_PUBLIC_SITE_URL per environment. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "mawica.";
export const SITE_DESCRIPTION = "Create beautiful, personalised, magical Christmas and New Year greeting cards for free, and share them with a link, WhatsApp or QR code.";
