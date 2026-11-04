import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-center justify-center px-5 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "#a63d78" }}>404</p>
      <h1 className="mt-4 font-display text-4xl sm:text-5xl">We couldn&rsquo;t find that page</h1>
      <ButtonLink href="/" variant="secondary" className="mt-8">Back to home</ButtonLink>
    </section>
  );
}
