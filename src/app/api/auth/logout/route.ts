import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/constants";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ data: { ok: true } });
}
