import { authorizeApi } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";
import { getStation } from "@/lib/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/stations/[id]">) {
  const auth = await authorizeApi();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (id.length > 200) return fail("INVALID_ID", "Invalid station id", 400);
  const st = await getStation(decodeURIComponent(id));
  if (!st) return fail("NOT_FOUND", "Station not found", 404);
  return ok(st.view);
}
