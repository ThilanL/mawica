import type { Metadata, Viewport } from "next";
import { fontVariables } from "../fonts";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "../globals.css";

// Cards are private links: not indexed, and nothing personal appears in metadata or the preview image.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "A card for you | mawica.",
  description: "Someone made you a card on mawica. Open it for a little magic.",
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: [{ url: "/brand/mawica-icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/brand/mawica-app-icon.png", type: "image/png", sizes: "1254x1254" }],
  },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_AU", title: "A card for you | mawica.", description: "Someone made you a card on mawica. Open it for a little magic." },
  twitter: { card: "summary_large_image", title: "A card for you | mawica." },
};
export const viewport: Viewport = { themeColor: "#2A1B3D", viewportFit: "cover" };

/** Recipient layout: no site chrome, so the card fills the phone. */
export default function CardLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-dvh bg-midnight">{children}</body>
    </html>
  );
}
