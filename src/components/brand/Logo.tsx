import Image from "next/image";
import Link from "next/link";

/** Approved Mawica wordmark. Never restyle or recreate: use the supplied asset. */
export function Logo({ priority = false, className = "" }: { priority?: boolean; className?: string }) {
  return (
    <Link href="/" aria-label="mawica. home" className={`inline-block ${className}`}>
      <Image
        src="/brand/mawica-wordmark.png"
        alt="mawica. Bring your wishes to life."
        width={2000}
        height={667}
        priority={priority}
        sizes="160px"
        className="h-10 w-auto mix-blend-multiply"
      />
    </Link>
  );
}
