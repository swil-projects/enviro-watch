import "server-only";
import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { getEnv } from "../../env";
import { providerGet } from "../../http";
import { canonicalUnitFor, dedupeObservations, maxTime, normalizeReading, parseTimestamp } from "../../normalize";
import { ProviderError, serializeError, type SerializedProviderError } from "../errors";
import {
  seriesId as makeSeriesId,
  stationId as makeStationId,
  type HistoryRequest,
  type HistoryResult,
  type MonitoringProviderAdapter,
  type ProviderHealth,
  type StationSnapshot,
  type UnifiedObservation,
  type UnifiedSensor,
  type UnifiedSeries,
  type UnifiedStation,
} from "../contracts";
import { shapeOf } from "../shape";
import { chooseEcowittCycle, ECOWITT_CODES, ECOWITT_UNIT_PARAMS, ecowittMetricKey, ecowittSeriesLabel } from "./mapping";

const P = "ECOWITT" as const;

// ---------- response schemas (lenient: unknown groups are allowed) ----------
const Envelope = z.object({
  code: z.coerce.number(),
  msg: z.string().optional().default(""),
  time: z.union([z.string(), z.number()]).optional(),
  data: z.unknown(),
});

const DeviceListItem = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  name: z.string().optional().nullable(),
  mac: z.string().optional().nullable(),
  imei: z.string().optional().nullable(),
  type: z.coerce.number().optional().nullable(),
  date_zone_id: z.string().optional().nullable(),
  createtime: z.union([z.number(), z.string()]).optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  latitude: z.coerce.number().optional().nullable(),
  stationtype: z.string().optional().nullable(),
  iotdevice_list: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
});
type DeviceListItem = z.infer<typeof DeviceListItem>;

const DeviceListData = z.object({
  total: z.coerce.number().optional(),
  totalPage: z.coerce.number().optional(),
  pageNum: z.coerce.number().optional(),
  list: z.array(DeviceListItem).default([]),
});

export const RealtimeLeaf = z.object({
  time: z.union([z.string(), z.number()]).optional(),
  unit: z.string().optional().nullable(),
  value: z.union([z.string(), z.number()]).nullable().optional(),
});

// ---------- helpers ----------
function checkEnvelope(body: unknown, op: string) {
  const env = Envelope.safeParse(body);
  if (!env.success) throw new ProviderError({ provider: P, kind: "MALFORMED_RESPONSE", message: `${op}: response is not an Ecowitt envelope` });
  if (env.data.code !== 0) {
    const known = ECOWITT_CODES[env.data.code];
    throw new ProviderError({
      provider: P,
      kind: known?.kind ?? "INVALID_REQUEST",
      providerCode: env.data.code,
      message: `${op}: ${known?.text ?? env.data.msg ?? "error"} (code ${env.data.code})`,
    });
  }
  return env.data;
}

type DeviceRef = { mac?: string; imei?: string };
const refId = (d: DeviceRef) => d.mac ?? d.imei ?? "";

/**
 * Walk a real-time payload and yield every `{time, unit, value}` leaf with its dotted path.
 * Works for nested sub-device groups (e.g. `WFC01-0xxxxxx8.daily`). Skips the camera group.
 */
export function walkRealtime(data: unknown, prefix = ""): { path: string; leaf: z.infer<typeof RealtimeLeaf> }[] {
  const out: { path: string; leaf: z.infer<typeof RealtimeLeaf> }[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!prefix && k === "camera") continue;
    if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) {
      const leaf = RealtimeLeaf.safeParse(v);
      if (leaf.success) out.push({ path, leaf: leaf.data });
    } else if (v && typeof v === "object") {
      out.push(...walkRealtime(v, path));
    }
  }
  return out;
}

/** Walk a history payload: leaves look like `{unit, list: {"<unix>": "value"}}`. */
export function walkHistory(data: unknown, prefix = ""): { path: string; unit: string | null; points: [string, unknown][] }[] {
  const out: { path: string; unit: string | null; points: [string, unknown][] }[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && "list" in v) {
      const rec = v as { unit?: unknown; list?: unknown };
      const list = rec.list && typeof rec.list === "object" && !Array.isArray(rec.list) ? (rec.list as Record<string, unknown>) : {};
      out.push({ path, unit: typeof rec.unit === "string" ? rec.unit : null, points: Object.entries(list) });
    } else if (v && typeof v === "object") {
      out.push(...walkHistory(v, path));
    }
  }
  return out;
}

export function buildEcowittSeries(station: UnifiedStation, path: string, unit: string | null | undefined): { series: UnifiedSeries; sensor: UnifiedSensor } {
  const metricKey = ecowittMetricKey(path, unit);
  const group = path.split(".")[0];
  const sensorExt = group;
  const sensorId = `${station.id}#${sensorExt}`;
  return {
    sensor: { id: sensorId, stationId: station.id, externalId: sensorExt, name: group.replace(/_/g, " "), measurementTypes: [], metadata: { group } },
    series: {
      id: makeSeriesId(station.id, path),
      stationId: station.id,
      sensorId,
      metricKey,
      sourceKey: path,
      originalMetricName: ecowittSeriesLabel(path),
      unit: canonicalUnitFor(metricKey, unit),
      originalUnit: unit ?? null,
      statistic: null,
    },
  };
}

export class EcowittAdapter implements MonitoringProviderAdapter {
  readonly provider = P;
  readonly isDemo = false;
  readonly capabilities = {
    discovery: "supported" as const,
    latest: "supported" as const,
    history: "supported" as const,
    notes: [
      "Real-time endpoint returns data from the past 2 hours only; an offline device returns no readings.",
      "History resolution: 5 min (90 days), 30 min (365 days), 4 h (730 days), 1 day (1460 days); each request is limited to 1 day / 1 week / 1 month / 1 year respectively.",
      "Requests are made in metric units (°C, hPa, m/s, mm, W/m²); the provider-reported unit is preserved per reading.",
    ],
  };

  private get cfg() {
    return getEnv().ecowitt;
  }

  isConfigured() {
    return this.cfg.configured;
  }
  configuredDeviceCount() {
    return this.cfg.devices.length;
  }

  private url(path: string, params: Record<string, string>) {
    const u = new URL(path, this.cfg.baseUrl);
    u.searchParams.set("application_key", this.cfg.applicationKey ?? "");
    u.searchParams.set("api_key", this.cfg.apiKey ?? "");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u;
  }

  private async get(path: string, params: Record<string, string>, op: string) {
    const res = await providerGet({ provider: P, url: this.url(path, params), op });
    return { data: checkEnvelope(res.body, op).data, latencyMs: res.latencyMs, raw: res.body };
  }

  /** All weather-station devices on the account (paginated). Cameras (type 2) are skipped. */
  async listDevices(): Promise<DeviceListItem[]> {
    const all: DeviceListItem[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data } = await this.get("/api/v3/device/list", { limit: "50", page: String(page) }, "device/list");
      const parsed = DeviceListData.safeParse(data);
      if (!parsed.success) throw new ProviderError({ provider: P, kind: "MALFORMED_RESPONSE", message: "device/list: unexpected data shape" });
      all.push(...parsed.data.list.filter((d) => d.type !== 2));
      if (!parsed.data.totalPage || page >= parsed.data.totalPage) break;
    }
    return all;
  }

  private toStation(ref: DeviceRef, meta: Partial<DeviceListItem> & { device_status?: string | null } = {}): UnifiedStation {
    const ext = refId(ref);
    const lat = meta.latitude ?? null;
    const lon = meta.longitude ?? null;
    const validCoords = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
    return {
      id: makeStationId(P, ext.replace(/:/g, "")),
      provider: P,
      externalId: ext,
      name: meta.name?.trim() || `Ecowitt ${ext}`,
      projectId: null,
      projectName: null,
      latitude: validCoords ? lat : null,
      longitude: validCoords ? lon : null,
      timezone: meta.date_zone_id ?? null,
      lastSeenAt: null,
      providerStatus: meta.device_status ?? null,
      isDemo: false,
      metadata: {
        mac: ref.mac ?? null,
        imei: ref.imei ?? null,
        stationType: meta.stationtype ?? null,
        ecowittDeviceId: meta.id ?? null,
        createdAt: meta.createtime ? parseTimestamp(meta.createtime)?.toISOString() ?? null : null,
        subDevices: meta.iotdevice_list ?? [],
      },
    };
  }

  async fetchSnapshot() {
    const errors: SerializedProviderError[] = [];
    const warnings: string[] = [];
    if (!this.isConfigured()) {
      return { provider: P, configured: false, isDemo: false, capabilities: this.capabilities, configuredDeviceCount: this.configuredDeviceCount(), stations: [], errors: [new ProviderError({ provider: P, kind: "MISSING_CREDENTIALS", message: "ECOWITT_APPLICATION_KEY and ECOWITT_API_KEY are required" }).toJSON()], warnings };
    }

    // 1. Discovery (account device list) merged with explicitly configured devices.
    const metaById = new Map<string, DeviceListItem>();
    try {
      for (const d of await this.listDevices()) {
        const id = (d.mac ?? d.imei ?? "").toUpperCase();
        if (id) metaById.set(id, d);
      }
    } catch (e) {
      errors.push(serializeError(e, P));
      warnings.push("Device discovery failed; using configured devices only.");
    }
    const refs = new Map<string, DeviceRef>();
    for (const d of this.cfg.devices) refs.set(refId(d).toUpperCase(), d);
    for (const [id, d] of metaById) if (!refs.has(id)) refs.set(id, d.mac ? { mac: d.mac.toUpperCase() } : { imei: d.imei ?? undefined });
    for (const d of this.cfg.devices) if (metaById.size && !metaById.has(refId(d).toUpperCase())) warnings.push(`Configured device ${refId(d)} was not found in the account device list.`);

    // 2. Real-time readings per device (independent failures).
    const stations = await Promise.all(
      [...refs.entries()].map(async ([id, ref]) => this.snapshotDevice(ref, metaById.get(id))),
    );
    return { provider: P, configured: true, isDemo: false, capabilities: this.capabilities, configuredDeviceCount: this.configuredDeviceCount(), stations, errors, warnings };
  }

  private async snapshotDevice(ref: DeviceRef, meta?: DeviceListItem): Promise<StationSnapshot> {
    const station = this.toStation(ref, meta ?? {});
    const retrievedAt = new Date().toISOString();
    const snap: StationSnapshot = { station, sensors: [], series: [], latest: [], errors: [] };
    try {
      const params: Record<string, string> = { call_back: "all", ...ECOWITT_UNIT_PARAMS };
      if (ref.mac) params.mac = ref.mac;
      else if (ref.imei) params.imei = ref.imei;
      const { data } = await this.get("/api/v3/device/real_time", params, "real_time");
      const sensors = new Map<string, UnifiedSensor>();
      for (const { path, leaf } of walkRealtime(data)) {
        const { series, sensor } = buildEcowittSeries(station, path, leaf.unit);
        const s = sensors.get(sensor.id) ?? sensor;
        if (!s.measurementTypes.includes(series.metricKey)) s.measurementTypes.push(series.metricKey);
        sensors.set(s.id, s);
        snap.series.push(series);
        const n = normalizeReading({ provider: P, series, rawValue: leaf.value, rawUnit: leaf.unit, rawTime: leaf.time, origin: "PROVIDER_REALTIME", retrievedAt });
        if (n.ok) snap.latest.push(n.observation);
      }
      snap.sensors = [...sensors.values()];
      station.lastSeenAt = maxTime(snap.latest);
      if (!snap.latest.length) station.providerStatus = station.providerStatus ?? "No data in the last 2 h";
    } catch (e) {
      snap.errors.push(serializeError(e, P));
    }
    return snap;
  }

  async fetchHistory(req: HistoryRequest): Promise<HistoryResult> {
    const { station, start, end } = req;
    const cycle = chooseEcowittCycle(start, end);
    if (!cycle) {
      throw new ProviderError({ provider: P, kind: "UNSUPPORTED", message: "Requested range exceeds Ecowitt history retention or request limits; choose a shorter or more recent range." });
    }
    const tz = station.timezone || "UTC";
    const fmt = (d: Date) => format(new TZDate(d.getTime(), tz), "yyyy-MM-dd HH:mm:ss");
    const callBack = [...new Set(req.series.map((s) => s.sourceKey))];
    const seriesByPath = new Map(req.series.map((s) => [s.sourceKey, s]));
    const retrievedAt = new Date().toISOString();
    const obs: UnifiedObservation[] = [];
    let requestCount = 0;
    const notes = [`Provider history at ${cycle.label} resolution.`];
    const mac = station.metadata.mac as string | null;
    const imei = station.metadata.imei as string | null;

    // Chunk the window; pad each chunk by one cycle because start/end are interpreted in device-local time
    // and we filter to the exact UTC window using the returned unix timestamps.
    for (let t = start.getTime(); t < end.getTime(); t += cycle.maxSpanMs) {
      const cs = new Date(t);
      const ce = new Date(Math.min(end.getTime(), t + cycle.maxSpanMs - 1000));
      const params: Record<string, string> = { start_date: fmt(cs), end_date: fmt(ce), cycle_type: cycle.cycleType, call_back: callBack.join(","), ...ECOWITT_UNIT_PARAMS };
      if (mac) params.mac = mac;
      else if (imei) params.imei = imei;
      const { data } = await this.get("/api/v3/device/history", params, "history");
      requestCount++;
      for (const leaf of walkHistory(data)) {
        const series = seriesByPath.get(leaf.path) ?? buildEcowittSeries(station, leaf.path, leaf.unit).series;
        for (const [ts, v] of leaf.points) {
          const n = normalizeReading({ provider: P, series, rawValue: v, rawUnit: leaf.unit, rawTime: ts, origin: "PROVIDER_HISTORY", retrievedAt });
          if (!n.ok) continue;
          const at = Date.parse(n.observation.observedAt);
          if (at >= start.getTime() && at <= end.getTime()) obs.push(n.observation);
        }
      }
    }
    return { observations: dedupeObservations(obs), resolution: cycle.label, truncated: false, notes, requestCount };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    const steps: ProviderHealth["steps"] = [];
    const errors: SerializedProviderError[] = [];
    if (!this.isConfigured()) {
      return { provider: P, configured: false, isDemo: false, status: "not_configured", checkedAt, latencyMs: null, steps: [{ name: "Configuration", status: "error", detail: "ECOWITT_APPLICATION_KEY / ECOWITT_API_KEY not set" }], errors: [] };
    }
    steps.push({ name: "Configuration", status: this.cfg.invalidDeviceIds.length ? "warn" : "ok", detail: `${this.cfg.devices.length} configured device(s)${this.cfg.invalidDeviceIds.length ? `, ${this.cfg.invalidDeviceIds.length} invalid identifier(s) ignored` : ""}` });
    let latency: number | null = null;
    let shape: unknown;
    try {
      const t0 = Date.now();
      const devices = await this.listDevices();
      latency = Date.now() - t0;
      steps.push({ name: "Authentication & discovery (device/list)", status: "ok", detail: `${devices.length} weather device(s) on account` });
    } catch (e) {
      errors.push(serializeError(e, P));
      steps.push({ name: "Authentication & discovery (device/list)", status: "error", detail: (e as Error).message });
    }
    const first = this.cfg.devices[0];
    if (first) {
      try {
        const params: Record<string, string> = { call_back: "outdoor", ...ECOWITT_UNIT_PARAMS };
        if (first.mac) params.mac = first.mac;
        else if (first.imei) params.imei = first.imei;
        const { data, raw } = await this.get("/api/v3/device/real_time", params, "real_time(health)");
        shape = shapeOf(raw);
        const leaves = walkRealtime(data);
        const newest = leaves.map((l) => parseTimestamp(l.leaf.time)).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
        steps.push({ name: `Real-time data (${refId(first)})`, status: leaves.length ? "ok" : "warn", detail: leaves.length ? `${leaves.length} outdoor field(s); newest ${newest?.toISOString() ?? "unknown"}` : "Successful response but no readings in the last 2 h (device offline?)" });
      } catch (e) {
        errors.push(serializeError(e, P));
        steps.push({ name: `Real-time data (${refId(first)})`, status: "error", detail: (e as Error).message });
      }
    } else {
      steps.push({ name: "Real-time data", status: "skipped", detail: "No device configured; relying on discovery" });
    }
    const hasErr = steps.some((s) => s.status === "error");
    const allErr = steps.filter((s) => s.status !== "skipped").every((s) => s.status === "error");
    return { provider: P, configured: true, isDemo: false, status: allErr ? "down" : hasErr || steps.some((s) => s.status === "warn") ? "degraded" : "healthy", checkedAt, latencyMs: latency, steps, errors, responseShape: shape };
  }
}

