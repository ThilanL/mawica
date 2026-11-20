import "server-only";
import {
  assertPermission,
  hasPermission,
  StaffAuthzError,
  type StaffPermission,
} from "@/modules/staff/roles";
import { readStaffSession, type StaffSession } from "./session";

export async function requireStaffSession(): Promise<StaffSession> {
  const session = await readStaffSession();
  if (!session) throw new StaffAuthzError("Sign in required");
  return session;
}

export async function requirePermission(permission: StaffPermission): Promise<StaffSession> {
  const session = await requireStaffSession();
  assertPermission(session.role, permission);
  return session;
}

export { hasPermission, StaffAuthzError };
