/** Public site origin used for canonical URLs, OG tags, sitemap. Set NEXT_PUBLIC_SITE_URL per environment. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "mawica.";
/**
 * Staging/preview builds must never be indexed. Set MAWICA_NOINDEX=1 at BUILD time (the staging image build passes it); robots.txt,
 * the sitemap and page metadata are generated during `next build`, and next.config headers are compiled into the build. Production
 * builds leave it unset, so nothing changes there.
 */
export const isNoindex = (env: Record<string, string | undefined> = process.env) => env.MAWICA_NOINDEX === "1";
export const SITE_DESCRIPTION = "Create beautiful, personalised, magical Christmas and New Year greeting cards for free, and share them with a link, WhatsApp or QR code.";
