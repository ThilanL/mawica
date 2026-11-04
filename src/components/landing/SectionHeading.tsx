export function SectionHeading({ eyebrow, title, body, id }: { eyebrow: string; title: string; body?: string; id?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "#a63d78" }}>{eyebrow}</p>
      <h2 id={id} className="mt-4 font-display text-4xl leading-tight tracking-tight text-balance sm:text-5xl">{title}</h2>
      {body && <p className="mt-5 text-lg leading-relaxed text-ink-soft text-pretty">{body}</p>}
    </div>
  );
}
