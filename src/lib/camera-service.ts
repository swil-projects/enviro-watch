import "server-only";
import { cached } from "./cache";
import { CAMERA_RANGES, cameraDevice, type CameraFrames, type CameraRange } from "./camera";
import { fail } from "./api";
import { ProviderError } from "./integrations/errors";
import { ObscapeAdapter } from "./integrations/obscape/adapter";
import { getAdapters, getStation, NotFoundError } from "./service";
import { log } from "./logger";

async function resolveCamera(stationId: string) {
  const st = await getStation(stationId);
  if (!st) throw new NotFoundError("Unknown station");
  const { station } = st.view;
  const device = cameraDevice(station);
  const adapter = getAdapters().OBSCAPE;
  if (!device || !(adapter instanceof ObscapeAdapter)) throw new NotFoundError("This station has no camera");
  return { station, device, adapter, project: String(station.metadata.project ?? station.projectName ?? "") };
}

/** Frames captured in the window (oldest → newest). Shared and cached so many viewers cost one provider call. */
export async function getCameraFrames(stationId: string, range: CameraRange): Promise<CameraFrames> {
  const { station, device, adapter, project } = await resolveCamera(stationId);
  // Snap "now" to the minute so concurrent viewers share one cache entry.
  const end = new Date(Math.floor(Date.now() / 60_000) * 60_000 + 60_000);
  const start = new Date(end.getTime() - CAMERA_RANGES[range]);
  const { value } = await cached(`camera:frames:${stationId}:${range}:${end.getTime()}`, 90_000, () => adapter.listCameraFrames(project, station.externalId, { start, end }));
  return { stationId, stationName: station.name, device, frames: value, start: start.toISOString(), end: end.toISOString() };
}

/** One camera image. Not held in server memory (they are 0.5–1 MB); the browser caches by URL instead. */
export async function getCameraImage(stationId: string, which: "latest" | number) {
  const { station, adapter, project } = await resolveCamera(stationId);
  const image = await adapter.fetchCameraImage(project, station.externalId, which);
  return { ...image, stationName: station.name };
}

/** Map service/provider failures to an HTTP response without leaking provider internals. */
export function cameraErrorResponse(e: unknown): Response {
  if (e instanceof NotFoundError) return fail("NOT_FOUND", e.message, 404);
  if (e instanceof ProviderError) {
    if (e.kind === "DEVICE_NOT_FOUND") return fail("NO_IMAGE", e.message, 404);
    if (e.kind === "TIMEOUT") return fail("PROVIDER_TIMEOUT", "The camera provider took too long to respond", 504);
    if (e.kind === "RATE_LIMITED") return fail("PROVIDER_BUSY", "The camera provider is busy; try again shortly", 503);
    log.warn("camera.provider_error", { kind: e.kind, status: e.status });
    return fail("PROVIDER_ERROR", "The camera provider could not return the image", 502);
  }
  log.error("camera.unhandled", { message: (e as Error).message });
  return fail("INTERNAL", "Unexpected server error", 500);
}
