import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { ManagerError } from "./domain";
export const isDemo = () =>
  process.env.NODE_ENV !== "production" && !process.env.MANAGER_LOGIN_PASSWORD;
const hash = (s: string) => createHash("sha256").update(s).digest();
export const equalSecret = (a: string, b: string) =>
  timingSafeEqual(hash(a), hash(b));
function secret() {
  const s = process.env.MANAGER_SESSION_SECRET;
  if (!s || s.length < 32)
    throw new ManagerError(
      503,
      "Manager authentication needs a session secret of at least 32 characters.",
    );
  return s;
}
export function createSession() {
  const expiry = String(Date.now() + 8 * 3600000);
  return `${expiry}.${createHmac("sha256", secret()).update(expiry).digest("hex")}`;
}
export function authenticate(request: Request) {
  if (isDemo()) return;
  if (!process.env.MANAGER_LOGIN_PASSWORD)
    throw new ManagerError(
      503,
      "Manager sign-in is not configured. Set the server authentication environment variables.",
    );
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("campusfix_manager="))
    ?.slice(18);
  if (!value)
    throw new ManagerError(401, "Please sign in to your manager workspace.");
  const [expiry, signature] = value.split(".");
  if (
    !expiry ||
    !signature ||
    Number(expiry) < Date.now() ||
    !equalSecret(
      signature,
      createHmac("sha256", secret()).update(expiry).digest("hex"),
    )
  )
    throw new ManagerError(
      401,
      "Your manager session expired. Please sign in again.",
    );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const allowed =
    process.env.MANAGER_APP_URL ||
    `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (origin && origin !== allowed)
    throw new ManagerError(
      403,
      "This request came from an unrecognized origin.",
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ManagerError(403, "Cross-site requests are not allowed.");
}
const buckets = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, limit: number, period = 60000) {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
  const b = buckets.get(key) || { count: 0, until: now + period };
  if (++b.count > limit)
    throw new ManagerError(
      429,
      "Too many requests. Please wait a minute and try again.",
    );
  buckets.set(key, b);
}
