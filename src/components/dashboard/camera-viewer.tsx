"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { livePolling } from "@/lib/live-polling";
import { Camera, ChevronLeft, ChevronRight, CircleAlert, Download, ExternalLink, ImageOff, RefreshCw, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { useTimezone } from "@/components/providers/timezone";
import { TimeAgo } from "./status";
import { apiGet } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { CAMERA_RANGES, cameraImageUrl, type CameraFrames, type CameraRange } from "@/lib/camera";
import { cn } from "@/lib/utils";

const RANGE_LABEL: Record<CameraRange, string> = { "6h": "Last 6 hours", "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days" };

/**
 * Obscape camera images, the way the Obscape portal shows them: the newest image first, then
 * step through the frames the camera stored. Images are streamed through our authenticated
 * proxy (`/api/stations/[id]/camera/image`) so provider credentials never reach the browser.
 */
export function CameraViewer({ stationId, stationName, className }: { stationId: string; stationName: string; className?: string }) {
  const tz = useTimezone();
  const [range, setRange] = useState<CameraRange>("24h");
  /** null = follow the newest frame (also after the list refreshes). */
  const [selectedT, setSelectedT] = useState<number | null>(null);
  const [status, setStatus] = useState<{ src: string; ok: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const q = useQuery({
    queryKey: ["camera", stationId, range],
    queryFn: () => apiGet<CameraFrames>(`/api/stations/${encodeURIComponent(stationId)}/camera?range=${range}`),
    ...livePolling(120_000),
    staleTime: 60_000,
  });

  const frames = useMemo(() => q.data?.frames ?? [], [q.data]);
  const index = useMemo(() => {
    if (!frames.length) return -1;
    const i = selectedT === null ? -1 : frames.findIndex((f) => f.t === selectedT);
    return i === -1 ? frames.length - 1 : i;
  }, [frames, selectedT]);
  const frame = index >= 0 ? frames[index] : null;
  const atNewest = index === frames.length - 1;

  // With no stored frames in the window the provider may still hold a newest image: show it.
  const target: "latest" | number = frame ? frame.t : "latest";
  // `r` only changes after a failed load so "Retry" really re-requests (error responses are never cached).
  const src = q.data ? `${cameraImageUrl(stationId, target)}${attempt ? `&r=${attempt}` : ""}` : null;
  const state = !src ? "loading" : status?.src === src ? (status.ok ? "ok" : "error") : "loading";

  // Warm the neighbouring frames so stepping feels instant.
  useEffect(() => {
    if (state !== "ok" || index < 0) return;
    for (const n of [frames[index - 1], frames[index + 1]]) if (n) new Image().src = cameraImageUrl(stationId, n.t);
  }, [state, index, frames, stationId]);

  const step = (delta: number) => {
    const next = frames[Math.min(frames.length - 1, Math.max(0, index + delta))];
    if (next) setSelectedT(next.t);
  };

  const when = frame ? formatDateTime(frame.at, tz, "EEE d MMM yyyy, HH:mm") : null;
  const device = q.data?.device;

  return (
    <Card id="camera" className={className}>
      <CardHeader
        title="Camera"
        icon={<Camera className="size-4" />}
        description={device?.serial ? `Obscape camera ${device.serial}` : "Obscape camera images"}
        action={
          <>
            {device?.online !== undefined && device.online !== null && <Badge tone={device.online ? "good" : "warn"}>{device.online ? "Online" : "Offline"}</Badge>}
            <Select aria-label="Camera period" value={range} onChange={(e) => { setRange(e.target.value as CameraRange); setSelectedT(null); }} className="h-8 text-xs">
              {(Object.keys(CAMERA_RANGES) as CameraRange[]).map((r) => (
                <option key={r} value={r}>{RANGE_LABEL[r]}</option>
              ))}
            </Select>
            <Button size="sm" onClick={() => q.refetch()} disabled={q.isFetching} aria-label="Check for new images">
              <RefreshCw className={cn(q.isFetching && "animate-spin")} /> Refresh
            </Button>
          </>
        }
      />
      <CardBody className="space-y-3">
        {q.isError ? (
          <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
            <CircleAlert className="size-6 text-critical" aria-hidden />
            <p className="text-sm font-medium">Camera images could not be loaded</p>
            <p className="max-w-md text-xs text-text-3">{(q.error as Error).message}</p>
            <Button size="sm" onClick={() => q.refetch()}>Try again</Button>
          </div>
        ) : (
          <>
            {/* Cap display size — Obscape JPEGs are ~4K; full size stays on Open / Download. */}
            <div className="relative mx-auto flex h-[min(36vh,18rem)] w-full max-w-xl items-center justify-center overflow-hidden rounded-lg border border-border bg-black/90 sm:h-[min(40vh,20rem)]">
              {state === "loading" && <div className="absolute inset-0 animate-pulse bg-surface-3/40" aria-hidden />}
              {src && state !== "error" && (
                // Dynamic, authenticated proxy URL: next/image optimisation would only add a second hop.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt={`${stationName} camera${when ? `, ${when}` : ""}`}
                  decoding="async"
                  onLoad={() => setStatus({ src, ok: true })}
                  onError={() => setStatus({ src, ok: false })}
                  className={cn("max-h-full max-w-full object-contain transition-opacity duration-200", state === "ok" ? "opacity-100" : "opacity-0")}
                />
              )}
              {state === "error" && (
                <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 px-6 text-center">
                  <ImageOff className="size-7 text-text-3" aria-hidden />
                  <p className="text-sm font-medium">{frame ? "No image is available for this time" : "This camera has no image yet"}</p>
                  <p className="text-xs text-text-3">{frame ? "Try the previous or next capture." : "Check that the camera is online and has uploaded a picture."}</p>
                  <Button size="sm" onClick={() => setAttempt((a) => a + 1)}>Retry</Button>
                </div>
              )}
              {q.isPending && <p className="absolute inset-0 grid place-items-center text-xs text-white/70">Loading camera…</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm" aria-live="polite">
              <p className="font-medium">
                {when ?? (q.isPending ? "—" : "Most recent image")}
                {frame && <span className="ml-2 text-xs font-normal text-text-3">{tz} · {formatDateTime(frame.at, "UTC", "HH:mm")} UTC</span>}
              </p>
              {frame && (
                <p className="text-xs text-text-3">
                  <TimeAgo iso={frame.at} className="text-text-2" /> · capture {index + 1} of {frames.length}
                </p>
              )}
            </div>

            {frames.length > 1 && (
              <div className="flex items-center gap-2">
                <Button size="icon" aria-label="Previous (older) image" onClick={() => step(-1)} disabled={index <= 0}><ChevronLeft /></Button>
                <input
                  type="range"
                  min={0}
                  max={frames.length - 1}
                  step={1}
                  value={index}
                  onChange={(e) => setSelectedT(frames[Number(e.target.value)]?.t ?? null)}
                  aria-label="Capture time"
                  aria-valuetext={when ?? undefined}
                  className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
                />
                <Button size="icon" aria-label="Next (newer) image" onClick={() => step(1)} disabled={atNewest}><ChevronRight /></Button>
                <Button size="sm" onClick={() => setSelectedT(null)} disabled={atNewest}><SkipForward /> Latest</Button>
              </div>
            )}

            {!q.isPending && !frames.length && <p className="text-xs text-text-3">No captures were stored in this period{state === "ok" ? "; showing the most recent image the camera has." : "."}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <a className={buttonVariants({ size: "sm" })} href={cameraImageUrl(stationId, target)} target="_blank" rel="noreferrer">
                <ExternalLink /> Open full size
              </a>
              <a className={buttonVariants({ size: "sm" })} href={cameraImageUrl(stationId, target, { download: true })} download>
                <Download /> Download
              </a>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
