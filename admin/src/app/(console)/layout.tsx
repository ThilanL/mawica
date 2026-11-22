import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { readStaffSession } from "@/lib/session";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await readStaffSession();
  if (!session) redirect("/sign-in");
  return (
    <Shell staff={{ displayName: session.displayName, email: session.email, role: session.role }}>
      {children}
    </Shell>
  );
}
