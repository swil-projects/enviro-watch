/**
 * Camera support (client/server-safe: types and pure helpers only).
 *
 * Obscape camera devices publish telemetry rows (one per capture) through the normal data
 * endpoint and the captured JPEG for a row is retrieved with `image=<unix time of the row>`
 * (`image=latest` = newest). So the list of available frames is the list of row timestamps.
 */
import type { UnifiedStation } from "./integrations/contracts";

export interface CameraFrame {
  /** Unix seconds — the exact value the provider needs to return this frame. */
  t: number;
  /** ISO 8601 (UTC). */
  at: string;
}

export interface CameraFrames {
  stationId: string;
  stationName: string;
  device: { serial: string | null; online: boolean | null };
  /** Oldest → newest. */
  frames: CameraFrame[];
  start: string;
  end: string;
}

export const CAMERA_RANGES = { "6h": 6 * 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 } as const;
export type CameraRange = keyof typeof CAMERA_RANGES;

/** A station has a camera when its provider reported a `camera` device. Demo data never has one. */
export function cameraDevice(station: Pick<UnifiedStation, "provider" | "isDemo" | "metadata">): { serial: string | null; online: boolean | null } | null {
  if (station.provider !== "OBSCAPE" || station.isDemo) return null;
  const devices = station.metadata?.devices;
  if (!devices || typeof devices !== "object") return null;
  const cam = (devices as Record<string, unknown>).camera;
  if (!cam || typeof cam !== "object") return null;
  const c = cam as { serial?: unknown; online?: unknown };
  return { serial: c.serial == null ? null : String(c.serial), online: typeof c.online === "boolean" ? c.online : null };
}

/** Accepts `latest` or whole unix seconds; anything else is rejected (the value goes into a provider URL). */
export function parseFrameParam(raw: string | null | undefined): "latest" | number | null {
  if (raw === null || raw === undefined || raw === "" || raw === "latest") return "latest";
  if (!/^\d{9,11}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export function cameraImageUrl(stationId: string, frame: "latest" | number, opts: { download?: boolean } = {}): string {
  const q = new URLSearchParams({ t: String(frame) });
  if (opts.download) q.set("download", "1");
  return `/api/stations/${encodeURIComponent(stationId)}/camera/image?${q}`;
}

/** Magic-byte sniffing so the response always carries the real content type. */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length > 7 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}
