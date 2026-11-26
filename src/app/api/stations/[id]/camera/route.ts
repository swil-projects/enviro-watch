import { authorizeApi } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";
import { CAMERA_RANGES, type CameraRange } from "@/lib/camera";
import { cameraErrorResponse, getCameraFrames } from "@/lib/camera-service";

/** Frames (capture times) a station's camera has stored, oldest first. `?range=6h|24h|7d|30d` (default 24h). */
export async function GET(req: Request, ctx: RouteContext<"/api/stations/[id]/camera">) {
  const auth = await authorizeApi();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (id.length > 200) return fail("INVALID_ID", "Invalid station id", 400);
  const range = new URL(req.url).searchParams.get("range") ?? "24h";
  if (!(range in CAMERA_RANGES)) return fail("INVALID_QUERY", "range must be one of 6h, 24h, 7d, 30d", 400);
  try {
    return ok(await getCameraFrames(decodeURIComponent(id), range as CameraRange));
  } catch (e) {
    return cameraErrorResponse(e);
  }
}
