import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WalletView } from "@/components/wallet/WalletView";
import { getSessionUser } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Card wallet | mawica.", robots: { index: false } };
// Reads the session at request time (same pattern as /account). All numbers come from /api/wallet in the browser.
export const instant = false;

export default async function WalletPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/account/wallet");
  return (
    <main className="bg-[linear-gradient(180deg,#fff8f4,#f3ebfb)] px-5 pb-24 pt-10 sm:pt-14">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/account" className="text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-midnight">&larr; Your account</Link>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "#a63d78" }}>Your cards</p>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">My Card Wallet</h1>
        <div className="mt-8"><WalletView /></div>
      </div>
    </main>
  );
}
