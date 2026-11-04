import type { Metadata, Viewport } from "next";
import { fontVariables } from "../fonts";
import "../globals.css";

export const metadata: Metadata = { title: "A card for you | mawica.", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#2A1B3D", viewportFit: "cover" };

/** Recipient layout: no site chrome, so the card fills the phone. */
export default function CardLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-dvh bg-midnight">{children}</body>
    </html>
  );
}
