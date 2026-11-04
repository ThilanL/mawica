import type { Metadata, Viewport } from "next";
import { fontVariables } from "../fonts";
import "../globals.css";

// Internal experiments. Never indexed; the routes themselves 404 in production (see lab/lumi/page.tsx).
export const metadata: Metadata = {
  title: "Lab | mawica.",
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = { themeColor: "#2A1B3D" };

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-dvh bg-midnight text-ivory">{children}</body>
    </html>
  );
}
