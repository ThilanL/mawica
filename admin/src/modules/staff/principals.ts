import "server-only";
import { db } from "@/lib/db";
import type { StaffRoleName } from "./roles";

export type StaffSessionPrincipal = {
  id: string;
  entraOid: string;
  email: string;
  displayName: string;
  role: StaffRoleName;
};

/**
 * Upsert staff principal after Entra (or local-dev) authentication.
 * Role comes from DB if the principal already exists; otherwise from the allowlist seed role.
 */
export async function upsertStaffPrincipal(input: {
  entraOid: string;
  email: string;
  displayName: string;
  seedRole: StaffRoleName;
}): Promise<StaffSessionPrincipal | null> {
  const email = input.email.trim().toLowerCase();
  const existing = await db.staffPrincipal.findUnique({ where: { entraOid: input.entraOid } });
  if (existing?.disabledAt) return null;

  const row = existing
    ? await db.staffPrincipal.update({
        where: { id: existing.id },
        data: {
          email,
          displayName: input.displayName.slice(0, 120),
          lastSeenAt: new Date(),
        },
      })
    : await db.staffPrincipal.create({
        data: {
          entraOid: input.entraOid,
          email,
          displayName: input.displayName.slice(0, 120),
          role: input.seedRole,
          lastSeenAt: new Date(),
        },
      });

  if (row.disabledAt) return null;
  return {
    id: row.id,
    entraOid: row.entraOid,
    email: row.email,
    displayName: row.displayName,
    role: row.role as StaffRoleName,
  };
}
