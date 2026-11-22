import Link from "next/link";
import type { ReactNode } from "react";
import { hasPermission, type StaffRoleName } from "@/modules/staff/roles";

const NAV: { href: string; label: string; permission: Parameters<typeof hasPermission>[1] }[] = [
  { href: "/", label: "Dashboard", permission: "dashboard:read" },
  { href: "/ops", label: "Operations", permission: "ops:read" },
  { href: "/customers", label: "Customers", permission: "users:read" },
  { href: "/reports", label: "Reports", permission: "reports:read" },
  { href: "/audit", label: "Moderation audit", permission: "audit:read" },
];

export function Shell({
  children,
  staff,
}: {
  children: ReactNode;
  staff: { displayName: string; email: string; role: StaffRoleName };
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--admin-line)] bg-[var(--admin-card)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold tracking-wide">
              mawica admin
            </Link>
            <nav className="flex flex-wrap gap-1" aria-label="Admin">
              {NAV.filter((n) => hasPermission(staff.role, n.permission)).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-full px-3 py-1.5 text-sm text-[var(--admin-muted)] hover:bg-black/5 hover:text-[var(--admin-ink)]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-medium">{staff.displayName}</div>
              <div className="text-xs text-[var(--admin-muted)]">
                {staff.role.toLowerCase()} · {staff.email}
              </div>
            </div>
            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded-full border border-[var(--admin-line)] px-3 py-1.5 text-sm hover:bg-black/5"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
