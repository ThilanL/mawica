import type { Metadata } from "next";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = { title: "Sign in | mawica.", description: "Sign in or create your mawica. account with a one-time email code.", robots: { index: false } };

export default function SignInPage() {
  return (
    <main className="relative isolate overflow-hidden bg-[radial-gradient(80%_55%_at_50%_0%,#f7e6ef,transparent_72%),linear-gradient(180deg,#fff8f4,#efe6fb)] px-5 pb-20 pt-10 sm:pt-16">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-16 -z-10 size-[26rem] rounded-full bg-lavender/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-24 top-1/2 -z-10 size-[22rem] rounded-full bg-rose/15 blur-3xl" />
      <div className="mx-auto w-full max-w-md">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "#a63d78" }}>Welcome</p>
        <h1 className="mt-3 text-center font-display text-4xl leading-tight text-balance sm:text-5xl">Sign in or create your account</h1>
        <p className="mx-auto mt-4 max-w-sm text-center text-ink-soft">New here? Enter your email and confirm the code we send. That&rsquo;s all it takes to get started.</p>
        <div className="mt-9"><SignInForm /></div>
        <p className="mt-7 text-center text-sm text-ink-soft">You can still <a href="/create" className="font-semibold text-midnight underline underline-offset-4">create and share a card</a> without an account.</p>
      </div>
    </main>
  );
}
