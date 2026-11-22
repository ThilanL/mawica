import type { HTMLAttributes, ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Render as the page H1 (hero) or an inline span. */
  as?: "span" | "h1";
} & Omit<HTMLAttributes<HTMLElement>, "children">;

/**
 * Lightweight React Bits–style gradient text: a slow sliding brand gradient clipped to the glyphs.
 * CSS-only (no animation libraries). `prefers-reduced-motion` freezes on a plum-dominant stop.
 * Both lines of a heading share one continuous gradient when nested under a single element.
 */
export function GradientText({ children, className = "", as = "span", ...rest }: Props) {
  const Tag = as;
  return (
    <Tag className={`hero-gradient-text ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
