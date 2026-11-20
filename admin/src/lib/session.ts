import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { StaffRoleName } from "@/modules/staff/roles";
import { env } from "./env";

export const STAFF_COOKIE = "mawica_admin_session";
const MAX_AGE_SEC = 60 * 60 * 8; // 8 hours

export type StaffSession = {
  sid: string;
  staffPrincipalId: string;
  entraOid: string;
  email: string;
  displayName: string;
  role: StaffRoleName;
};

function secretKey() {
  return new TextEncoder().encode(env.ADMIN_SESSION_SECRET);
}

export async function createStaffSessionToken(session: Omit<StaffSession, "sid"> & { sid?: string }): Promise<string> {
  const sid = session.sid ?? crypto.randomUUID();
  return new SignJWT({
    staffPrincipalId: session.staffPrincipalId,
    entraOid: session.entraOid,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sid)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secretKey());
}

export async function readStaffSession(): Promise<StaffSession | null> {
  const jar = await cookies();
  const token = jar.get(STAFF_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sub !== "string") return null;
    if (typeof payload.staffPrincipalId !== "string") return null;
    if (typeof payload.entraOid !== "string") return null;
    if (typeof payload.email !== "string") return null;
    if (typeof payload.displayName !== "string") return null;
    if (typeof role !== "string") return null;
    return {
      sid: payload.sub,
      staffPrincipalId: payload.staffPrincipalId,
      entraOid: payload.entraOid,
      email: payload.email,
      displayName: payload.displayName,
      role: role as StaffRoleName,
    };
  } catch {
    return null;
  }
}

export async function setStaffSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: env.ADMIN_APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearStaffSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(STAFF_COOKIE);
}
