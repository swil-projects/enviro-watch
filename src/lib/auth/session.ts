import "server-only";
import { timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "../env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "./constants";

/**
 * Single-organisation authentication without a user database:
 * credentials come from AUTH_USERNAME / AUTH_PASSWORD, sessions are stateless
 * HS256-signed JWTs in an httpOnly, SameSite=Lax, Secure (in production) cookie.
 *
 * If authentication is not configured:
 *   - development: access is open and the UI shows a warning banner;
 *   - production: every protected page/API is refused.
 */

export interface SessionUser {
  username: string;
  role: "admin";
}

const key = () => new TextEncoder().encode(getEnv().auth.secret ?? "");

export function authMode(): "enabled" | "open-dev" | "misconfigured" {
  const { auth } = getEnv();
  // Explicit opt-out for local evaluation / testing. Never set this on a public deployment.
  if (process.env.AUTH_DISABLED === "true") return "open-dev";
  if (auth.enabled) return "enabled";
  return process.env.NODE_ENV === "production" ? "misconfigured" : "open-dev";
}

export async function createSessionToken(username: string) {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || !getEnv().auth.enabled) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { username: payload.sub, role: "admin" };
  } catch {
    return null;
  }
}

const digest = (s: string) => createHash("sha256").update(s).digest();
export function checkCredentials(username: string, password: string): boolean {
  const { auth } = getEnv();
  if (!auth.enabled) return false;
  const u = timingSafeEqual(digest(username), digest(auth.username!));
  const p = timingSafeEqual(digest(password), digest(auth.password!));
  return u && p;
}

/** Current user, or null. Open-dev mode returns a synthetic local user. */
export async function getUser(): Promise<SessionUser | null> {
  // Auth is always request-scoped. Without this, open-dev / misconfigured modes never touch
  // cookies(), so Next would try to prerender protected pages and run live provider fetches
  // at build time (which then fail with "fetch() rejects when the prerender is complete").
  await connection();
  const mode = authMode();
  if (mode === "open-dev") return { username: "local-dev", role: "admin" };
  if (mode === "misconfigured") return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/** For pages: redirect to login when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** For route handlers: returns a Response to send if unauthorized, else the user. */
export async function authorizeApi(): Promise<{ user: SessionUser } | { response: Response }> {
  const mode = authMode();
  if (mode === "misconfigured") return { response: Response.json({ error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured on this server." } }, { status: 503 }) };
  const user = await getUser();
  if (!user) return { response: Response.json({ error: { code: "UNAUTHORIZED", message: "Sign in required" } }, { status: 401 }) };
  return { user };
}
