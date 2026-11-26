import { authorizeApi } from "@/lib/auth/session";
import { fail } from "@/lib/api";
import { parseFrameParam } from "@/lib/camera";
import { cameraErrorResponse, getCameraImage } from "@/lib/camera-service";

/**
 * Camera image proxy. The Obscape credentials stay on the server: the browser only ever
 * talks to this authenticated endpoint. `?t=latest` (default) or `?t=<unix seconds of a frame>`;
 * `&download=1` forces a file download.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/stations/[id]/camera/image">) {
  const auth = await authorizeApi();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (id.length > 200) return fail("INVALID_ID", "Invalid station id", 400);
  const q = new URL(req.url).searchParams;
  const which = parseFrameParam(q.get("t"));
  if (which === null) return fail("INVALID_QUERY", "t must be 'latest' or a unix timestamp in seconds", 400);
  try {
    const img = await getCameraImage(decodeURIComponent(id), which);
    const slug = img.stationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "camera";
    const stamp = which === "latest" ? "latest" : new Date(which * 1000).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const ext = img.contentType === "image/png" ? "png" : "jpg";
    return new Response(img.bytes as BodyInit, {
      headers: {
        "Content-Type": img.contentType,
        "Content-Length": String(img.bytes.byteLength),
        "Content-Disposition": `${q.get("download") === "1" ? "attachment" : "inline"}; filename="${slug}_${stamp}.${ext}"`,
        // A frame at a fixed time never changes; "latest" does.
        "Cache-Control": which === "latest" ? "private, max-age=60" : "private, max-age=86400, immutable",
      },
    });
  } catch (e) {
    return cameraErrorResponse(e);
  }
}
