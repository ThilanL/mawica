import { ButtonLink } from "./Button";

/** Honest placeholder for routes that exist in the navigation but are not built yet. */
export function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-center justify-center px-5 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "#a63d78" }}>Coming soon</p>
      <h1 className="mt-4 font-display text-5xl leading-tight text-balance">{title}</h1>
      <p className="mt-5 text-lg text-ink-soft">{body}</p>
      <ButtonLink href="/" variant="secondary" className="mt-9">Back to home</ButtonLink>
    </section>
  );
}
