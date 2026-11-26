import { cookies } from "next/headers";
import { z } from "zod";
import { checkCredentials, createSessionToken, authMode } from "@/lib/auth/session";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/constants";
import { getState, setState } from "@/lib/cache";

const Body = z.object({ username: z.string().min(1).max(200), password: z.string().min(1).max(500) });

/** In-memory brute-force throttle: at most 10 failed attempts per 15 min per client address. */
const WINDOW_MS = 15 * 60_000;
function isLocked(ip: string) {
  const rec = getState<{ n: number; since: number }>(`login:${ip}`);
  return Boolean(rec && Date.now() - rec.since < WINDOW_MS && rec.n >= 10);
}
function recordFailure(ip: string) {
  const k = `login:${ip}`;
  const rec = getState<{ n: number; since: number }>(k);
  if (!rec || Date.now() - rec.since > WINDOW_MS) setState(k, { n: 1, since: Date.now() });
  else setState(k, { ...rec, n: rec.n + 1 });
}

export async function POST(req: Request) {
  if (authMode() !== "enabled") return Response.json({ error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured" } }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (isLocked(ip)) return Response.json({ error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !checkCredentials(parsed.data.username, parsed.data.password)) {
    recordFailure(ip);
    return Response.json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } }, { status: 401 });
  }
  setState(`login:${ip}`, undefined);
  const token = await createSessionToken(parsed.data.username);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return Response.json({ data: { ok: true } });
}
