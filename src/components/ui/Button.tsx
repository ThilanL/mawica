import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 focus-visible:outline-offset-4 active:scale-[0.98]";
const variants: Record<Variant, string> = {
  primary: "bg-midnight text-ivory hover:bg-[#3d2a56] shadow-soft",
  secondary: "border border-midnight/20 bg-white/60 text-midnight hover:bg-white backdrop-blur",
  ghost: "text-midnight hover:bg-midnight/5",
};
const sizes = { md: "px-5 py-2.5 text-sm", lg: "px-7 py-3.5 text-base" };

type Common = { variant?: Variant; size?: keyof typeof sizes };

export function ButtonLink({ variant = "primary", size = "lg", className = "", ...props }: Common & ComponentProps<typeof Link>) {
  return <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

export function Button({ variant = "primary", size = "lg", className = "", ...props }: Common & ComponentProps<"button">) {
  return <button type="button" className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
