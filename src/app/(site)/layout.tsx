import type { Metadata, Viewport } from "next";
import { fontVariables } from "../fonts";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { resolveFooter, resolveNav, resolveSeo } from "@/modules/cms/resolve";
import { isNoindex, SITE_NAME, SITE_URL } from "@/lib/site";
import "../globals.css";

/** CMS resolvers read the DB (with static fallbacks) — allow request-time rendering. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { data: seo } = await resolveSeo();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: seo.titleDefault, template: "%s" },
    description: seo.description,
    alternates: { canonical: "/" },
    // File conventions (app/favicon.ico, icon.png, apple-icon.png) supply the tab and home-screen icons.
    // Keep metadata as a fallback for older crawlers and for card routes that share the same brand mark.
    icons: {
      icon: [{ url: "/brand/mawica-icon-192.png", type: "image/png", sizes: "192x192" }],
      apple: [{ url: "/brand/mawica-app-icon.png", type: "image/png", sizes: "1254x1254" }],
    },
    manifest: "/site.webmanifest",
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_AU",
      title: seo.ogTitle,
      description: seo.ogDescription,
      url: "/",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.twitterTitle,
      description: seo.twitterDescription,
    },
    // Staging noindex is env-driven and cannot be overridden by CMS.
    ...(isNoindex() ? { robots: { index: false, follow: false } } : {}),
  };
}

export const viewport: Viewport = { themeColor: "#FFF8F4" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ data: nav }, { data: footer }] = await Promise.all([resolveNav(), resolveFooter()]);
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-dvh flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-midnight focus:px-5 focus:py-3 focus:text-ivory"
        >
          Skip to content
        </a>
        <SiteHeader nav={nav} />
        <main id="main" className="flex-1">{children}</main>
        <SiteFooter footer={footer} />
      </body>
    </html>
  );
}
