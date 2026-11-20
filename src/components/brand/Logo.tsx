import Link from "next/link";
import { Wordmark } from "./Wordmark";

/** Approved Mawica wordmark linked to home. Never restyle or recreate: use the supplied asset. */
export function Logo({
  priority = false,
  className = "",
  surface = "light",
}: {
  priority?: boolean;
  className?: string;
  surface?: "light" | "dark";
}) {
  return (
    <Link href="/" aria-label="mawica. home" className={`inline-block ${className}`}>
      <Wordmark variant="full" size="md" surface={surface} priority={priority} />
    </Link>
  );
}
