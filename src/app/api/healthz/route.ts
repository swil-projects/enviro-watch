import { connection } from "next/server";

/** Liveness probe (no auth, no provider calls, no data). */
export async function GET() {
  await connection();
  return Response.json({ status: "ok", time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
