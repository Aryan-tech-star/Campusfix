import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, type Tx } from "./db";
import { ManagerError } from "../lib/manager/domain";
import type { Role, SessionUser } from "../lib/portal/types";

export const COOKIE = "campusfix_session";
const lifetime = 7 * 24 * 60 * 60 * 1000;
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:32768:8:1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const fields = encoded.split(":");
  if (
    fields.length !== 6 ||
    fields.slice(0, 4).join(":") !== "scrypt:32768:8:1"
  )
    return false;
  const expected = Buffer.from(fields[5], "hex"),
    actual = await derive(password, fields[4]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function publicUser(user: {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  room?: { hostelId: string; number: string } | null;
  technician?: { id: string } | null;
}): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    ...(user.room
      ? { propertyId: user.room.hostelId, room: user.room.number }
      : {}),
    ...(user.technician ? { technicianId: user.technician.id } : {}),
  };
}
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
});
export async function issueSession(userId: string, res: Response) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      tokenHash: digest(token),
      userId,
      expiresAt: new Date(Date.now() + lifetime),
    },
  });
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: lifetime });
}
export async function clearSession(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE];
  if (typeof token === "string")
    await db.session.deleteMany({ where: { tokenHash: digest(token) } });
  res.clearCookie(COOKIE, cookieOptions());
}
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.[COOKIE];
  if (typeof token !== "string" || token.length > 100)
    throw new ManagerError(401, "Please sign in to CampusFix.");
  const session = await db.session.findUnique({
    where: { tokenHash: digest(token) },
    include: { user: { include: { room: true, technician: true } } },
  });
  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    !session.user.active
  )
    throw new ManagerError(401, "Your session expired. Please sign in again.");
  res.locals.user = publicUser(session.user);
  next();
}
export function requireRoles(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes((res.locals.user as SessionUser).role))
      throw new ManagerError(
        403,
        "Your account is not authorized for this workspace.",
      );
    next();
  };
}
export async function rateLimit(
  key: string,
  limit: number,
  windowMs = 60000,
  client: Tx | typeof db = db,
) {
  // Atomic PostgreSQL counters work across backend replicas; no password/key enters the key.
  const now = new Date(),
    until = new Date(Date.now() + windowMs);
  const rows = await client.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" (key, count, until) VALUES (${key}, 1, ${until})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit".until < ${now} THEN 1 ELSE "RateLimit".count + 1 END,
      until = CASE WHEN "RateLimit".until < ${now} THEN ${until} ELSE "RateLimit".until END
    RETURNING count`;
  if (rows[0].count > limit)
    throw new ManagerError(
      429,
      "Too many attempts. Wait a minute before trying again.",
    );
}
