import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "./lib/auth/constants";

/**
 * Optimistic authentication check. The authoritative check happens again in
 * every page (requireUser) and route handler (authorizeApi).
 */
export async function proxy(req: NextRequest) {
  const authEnabled = process.env.AUTH_DISABLED !== "true" && Boolean(process.env.AUTH_SECRET && process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD);
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("X-Frame-Options", "DENY");
  if (!authEnabled) return res;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let ok = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), { algorithms: ["HS256"] });
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (ok) return res;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required" } }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, auth endpoints, the liveness probe and static assets.
  matcher: ["/((?!login|api/auth|api/healthz|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|webp)$).*)"],
};
