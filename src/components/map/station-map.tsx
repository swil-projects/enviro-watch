"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { CircleMarker as LCircleMarker } from "leaflet";
import { cssVar } from "@/components/charts/colors";
import { PROVIDER_META } from "@/lib/integrations/contracts";
import { FRESHNESS_LABEL } from "@/lib/freshness";
import { cameraImageUrl } from "@/lib/camera";
import type { StationRow } from "@/lib/overview";

const STATUS_VAR = { live: "--good", stale: "--warn", offline: "--text-3", error: "--critical" } as const;

/** Satellite imagery + place/road labels (Google Maps satellite-style hybrid). No API key. */
const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const ROADS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const ATTRIBUTION = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>';

/** Newest camera frame for a station. Only mounted while its popup is open, so images load on demand. */
function CameraThumb({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <Link href={`/stations/${encodeURIComponent(id)}#camera`} aria-label={`Open ${name} camera`} className="relative block h-24 w-40 overflow-hidden rounded-md bg-black/80">
      {failed ? (
        <span className="grid size-full place-items-center px-3 text-center text-[11px] text-white/70">No camera image available yet</span>
      ) : (
        // Authenticated proxy URL; next/image optimisation would only add a second hop.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cameraImageUrl(id, "latest")} alt={`Latest image from ${name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-cover" />
      )}
    </Link>
  );
}

function FitBounds({ rows }: { rows: StationRow[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = rows.map((r) => [r.latitude!, r.longitude!] as [number, number]);
    if (pts.length === 1) map.setView(pts[0], 11);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
  }, [rows, map]);
  return null;
}

function FlyTo({ row }: { row: StationRow | null }) {
  const map = useMap();
  useEffect(() => {
    if (row) map.flyTo([row.latitude!, row.longitude!], Math.max(map.getZoom(), 12), { duration: 0.6 });
  }, [row, map]);
  return null;
}

/** Leaflet needs a non-zero box; Chrome often paints before the flex parent finishes layout. */
function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const sync = () => map.invalidateSize({ pan: false });
    sync();
    const frame = requestAnimationFrame(sync);
    window.addEventListener("resize", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", sync);
    };
  }, [map]);
  return null;
}

export default function StationMap({ rows, selectedId, onSelect }: { rows: StationRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const markers = useRef(new Map<string, LCircleMarker>());
  const shellRef = useRef<HTMLDivElement>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  // Leaflet mutates DOM imperatively; cacheComponents/Activity cleanup calls map.remove()
  // and leaves stale panes. Only mount MapContainer while the effect is active so each
  // show gets a fresh Leaflet instance instead of appendChild on destroyed panes.
  const [mapKey, setMapKey] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const arm = () => {
      if (cancelled) return;
      const box = shellRef.current;
      if (!box || box.clientHeight < 32 || box.clientWidth < 32) {
        if (attempts++ < 60) requestAnimationFrame(arm);
        return;
      }
      setMapKey((k) => (k === null ? 1 : k + 1));
    };
    arm();
    return () => {
      cancelled = true;
      setMapKey(null);
    };
  }, []);

  useEffect(() => {
    if (selectedId) markers.current.get(selectedId)?.openPopup();
  }, [selectedId]);

  return (
    <div ref={shellRef} className="relative h-full w-full">
      {mapKey === null ? (
        <div className="h-full w-full animate-pulse rounded-lg bg-surface-2" aria-hidden />
      ) : (
        <MapContainer
          key={mapKey}
          center={[18.1, -77.3]}
          zoom={8}
          scrollWheelZoom
          className="h-full w-full rounded-lg"
          style={{ height: "100%", width: "100%" }}
          aria-label="Station map"
        >
          <TileLayer attribution={ATTRIBUTION} url={IMAGERY} maxZoom={19} />
          <TileLayer url={ROADS} maxZoom={19} opacity={0.9} />
          <TileLayer url={LABELS} maxZoom={19} />
          <InvalidateSize />
          <FitBounds rows={rows} />
          <FlyTo row={selected} />
          {rows.map((r) => (
            <CircleMarker
              key={r.id}
              ref={(m) => {
                if (m) markers.current.set(r.id, m);
                else markers.current.delete(r.id);
              }}
              center={[r.latitude!, r.longitude!]}
              radius={r.id === selectedId ? 11 : 8}
              pathOptions={{ color: cssVar(PROVIDER_META[r.provider].color.slice(4, -1)), weight: 3, fillColor: cssVar(STATUS_VAR[r.freshness]), fillOpacity: 0.95 }}
              eventHandlers={{ click: () => onSelect(r.id) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <strong>{r.name}</strong> · {FRESHNESS_LABEL[r.freshness]}
              </Tooltip>
              <Popup>
                <div className="min-w-52 space-y-1 text-xs">
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p>{PROVIDER_META[r.provider].name} · {r.externalId}</p>
                  <p>Status: {FRESHNESS_LABEL[r.freshness]}</p>
                  <p>{r.seriesCount} measurements</p>
                  {r.hasCamera && <CameraThumb id={r.id} name={r.name} />}
                  <Link href={`/stations/${encodeURIComponent(r.id)}${r.hasCamera ? "#camera" : ""}`} className="font-medium underline">
                    {r.hasCamera ? "Open station & camera history →" : "Open station →"}
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}
