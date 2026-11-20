import type { Metadata, Viewport } from "next";
import { fontVariables } from "../fonts";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { isNoindex, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "../globals.css";


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "mawica. | Bring your wishes to life", template: "%s" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  icons: { icon: "/brand/mawica-app-icon.png", apple: "/brand/mawica-app-icon.png" },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_AU", title: "mawica. | Bring your wishes to life", description: SITE_DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: "mawica. | Bring your wishes to life", description: SITE_DESCRIPTION },
  ...(isNoindex() ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = { themeColor: "#FFF8F4" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-dvh flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-midnight focus:px-5 focus:py-3 focus:text-ivory"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
