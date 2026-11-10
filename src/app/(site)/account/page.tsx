import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/auth/AccountSettings";
import { db } from "@/lib/db";
import { getSessionUser } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Your account | mawica.", robots: { index: false } };
// Reads the session at request time. Blocking (not streamed) so a signed-out visit gets a real 307 redirect.
export const instant = false;

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/account");
  const profile = await db.profile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, termsAcceptedAt: new Date() }, select: { displayName: true, timeZone: true } });
  const initial = Array.from((profile.displayName?.trim() || user.email))[0]?.toUpperCase() ?? "?";
  return (
    <main className="bg-[linear-gradient(180deg,#fff8f4,#f3ebfb)] px-5 pb-24 pt-10 sm:pt-14">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-center gap-4">
          <span aria-hidden className="grid size-14 place-items-center rounded-full bg-[linear-gradient(145deg,#3a2556,#2a1b3d)] font-display text-2xl text-ivory shadow-soft">{initial}</span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "#a63d78" }}>Your account</p>
            <h1 className="font-display text-3xl leading-tight sm:text-4xl">{profile.displayName?.trim() ? `Hello, ${profile.displayName.trim()}` : "Welcome back"}</h1>
          </div>
        </div>
        <div className="mt-8">
          <AccountSettings initial={{ email: user.email, emailVerified: user.emailVerified, displayName: profile.displayName, timeZone: profile.timeZone }} />
        </div>
      </div>
    </main>
  );
}
