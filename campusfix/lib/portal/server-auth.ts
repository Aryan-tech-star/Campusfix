import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backendUrl } from "./backend";
import type { Role, SessionUser } from "./types";
export async function currentUser(): Promise<SessionUser | null> {
  const cookie = (await cookies()).get("campusfix_session");
  if (!cookie) return null;
  try {
    const response = await fetch(`${backendUrl()}/api/auth/me`, {
      headers: { cookie: `campusfix_session=${cookie.value}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Authentication service unavailable");
    return (await response.json()).user;
  } catch {
    throw new Error(
      "CampusFix cannot reach its authentication service. Start the backend and refresh.",
    );
  }
}
export async function requireRole(role: Role) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(`/${user.role.toLowerCase()}`);
  return user;
}
