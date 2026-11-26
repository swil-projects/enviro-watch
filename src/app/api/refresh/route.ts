import { authorizeApi } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";
import { refreshAll } from "@/lib/service";

/** Manual refresh: bypasses the snapshot cache (rate-limited server-wide). */
export async function POST() {
  const auth = await authorizeApi();
  if ("response" in auth) return auth.response;
  const r = await refreshAll();
  if (!r.refreshed) return fail("RATE_LIMITED", `Refreshed recently. Try again in ${r.retryInSeconds}s.`, 429);
  return ok(r);
}
