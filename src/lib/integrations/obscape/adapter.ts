import "server-only";
import { z } from "zod";
import { getEnv } from "../../env";
import { providerGet } from "../../http";
import { canonicalUnitFor, dedupeObservations, maxTime, normalizeReading, parseNumeric, parseTimestamp } from "../../normalize";
import { slugify } from "../../metrics/registry";
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
import { log } from "../../logger";
import { sniffImageType, type CameraFrame } from "../../camera";

/**
 * Obscape Data Portal — API v3.
 *
 * There is no public reference for API v3. The contract below was established
 * empirically against the live API with authorised credentials on 2026-11-13
 * (see docs/integration-research.md). All requests are GETs on one endpoint,
 * authenticated with `username` + `key` query parameters:
 *
 *   ?                                         → projects  [{ name, timezone }]
 *   ?project=<name>                           → stations  [{ id, name, latitude, longitude, reference, devices: { <type>: { serial, online, charged, inposition, inrange, settings } } }]
 *   ?project=<name>&station=<id>              → device types [ "camera", "wavegauge", … ]
 *   ?project=<name>&station=<id>&device=<t>   → { data: [{ time: "<unix s>", <param>: number, …, invalid, tstr }], parameters: [{ name, symbol, unit, caption }] }
 *     + &from=YYYY-MM-DD HH:MM:SS&to=…        → that window (interpreted as UTC). Without from/to: the last 24 h.
 *   ?project=<name>&station=<id>&device=camera&image=latest            → image/jpeg (newest frame)
 *   ?project=<name>&station=<id>&device=camera&image=<unix s>          → image/jpeg for the camera data row with that exact `time`
 *     (an unknown time answers HTTP 200 with the JSON body `[]`). Verified live 2026-11-19.
 *
 * Unix timestamps for from/to return HTTP 500. Ranges up to 90 days returned
 * complete results; requests are still chunked to 31 days.
 */
const P = "OBSCAPE" as const;
const DAY = 86_400_000;
const CHUNK_MS = 31 * DAY;

// ---------------------------------------------------------------- schemas
const ProjectSchema = z.object({ name: z.string(), timezone: z.string().optional().nullable() });
// Device fields are informational; keep the schema lenient so one odd field never drops a station.
const DeviceSchema = z.object({
  serial: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
  online: z.union([z.string(), z.number()]).optional().nullable(),
  charged: z.union([z.string(), z.number()]).optional().nullable(),
  inposition: z.union([z.string(), z.number()]).optional().nullable(),
  inrange: z.union([z.string(), z.number()]).optional().nullable(),
  settings: z.unknown().optional(),
});
const StationSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  latitude: z.union([z.string(), z.number()]).optional().nullable(),
  longitude: z.union([z.string(), z.number()]).optional().nullable(),
  reference: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
  devices: z.union([z.record(z.string(), DeviceSchema.catch({})), z.array(z.unknown())]).optional().nullable(),
});
const ParameterSchema = z.object({ name: z.string(), symbol: z.string().optional().nullable(), unit: z.string().optional().nullable(), caption: z.string().optional().nullable() });
const DataResponseSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())).default([]),
  parameters: z.array(ParameterSchema).default([]),
});
export type ObscapeProject = z.infer<typeof ProjectSchema>;
export type ObscapeStation = z.infer<typeof StationSchema>;
export type ObscapeData = z.infer<typeof DataResponseSchema>;
type Parameter = z.infer<typeof ParameterSchema>;

/** Parameters that are not environmental time series. */
const NON_SERIES = new Set(["lat", "lon", "Puu", "time", "tstr", "invalid", "seq", "zref", "oper", "source"]);

/**
 * Obscape parameter name → canonical metric key, based on the captions the API returns.
 * TEMP / HUM are the logger's *internal* temperature / humidity, so they are deliberately
 * not merged with ambient air measurements (they stay provider-specific).
 */
const PARAM_MAP: Record<string, string> = {
  level: "water_level",
  wdepth: "water_depth",
  Hm0: "wave_height_significant",
  Hmax: "wave_height_max",
  Hsw: "swell_height",
  Tp: "wave_period_peak",
  Tsw: "swell_period",
  Tm01: "wave_period_tm01",
  Tm02: "wave_period_tm02",
  VBAT: "battery_voltage",
  VSOL: "solar_panel_voltage",
  PATM: "barometric_pressure",
};

export function obscapeMetricKey(param: string): string {
  return PARAM_MAP[param] ?? `obscape:${slugify(param)}`;
}

const flag = (v: unknown) => (v === null || v === undefined ? null : String(v) === "1");

export function obscapeStationRecord(project: ObscapeProject, st: ObscapeStation): { station: UnifiedStation; sensors: UnifiedSensor[]; deviceTypes: string[] } {
  const lat = parseNumeric(st.latitude);
  const lon = parseNumeric(st.longitude);
  const valid = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  const devices = st.devices && !Array.isArray(st.devices) ? st.devices : {};
  const deviceTypes = Object.keys(devices);
  const id = makeStationId(P, `${slugify(project.name)}-${st.id}`);
  const offline = deviceTypes.filter((t) => flag(devices[t].online) === false);
  const station: UnifiedStation = {
    id,
    provider: P,
    externalId: st.id,
    // Some stations come back with a blank name; fall back to the provider id rather than show nothing.
    name: st.name.trim() || `Obscape station ${st.id}`,
    projectId: project.name,
    projectName: project.name,
    latitude: valid ? lat : null,
    longitude: valid ? lon : null,
    timezone: project.timezone ?? null,
    lastSeenAt: null,
    providerStatus: !deviceTypes.length ? "No devices attached" : offline.length ? `Offline device(s): ${offline.join(", ")}` : "All devices online",
    isDemo: false,
    metadata: {
      project: project.name,
      reference: st.reference ?? null,
      devices: Object.fromEntries(
        deviceTypes.map((t) => [t, { serial: devices[t].serial ?? null, online: flag(devices[t].online), charged: flag(devices[t].charged), inPosition: flag(devices[t].inposition), inRange: flag(devices[t].inrange), settings: devices[t].settings ?? null }]),
      ),
    },
  };
  const sensors: UnifiedSensor[] = deviceTypes.map((t) => ({
    id: `${id}#${t}`,
    stationId: id,
    externalId: devices[t].serial ?? t,
    name: t,
    measurementTypes: [],
    metadata: { deviceType: t, serial: devices[t].serial ?? null },
  }));
  return { station, sensors, deviceTypes };
}

/** Convert one device data response into series + normalized observations. */
export function parseDeviceData(station: UnifiedStation, device: string, body: ObscapeData, origin: "PROVIDER_REALTIME" | "PROVIDER_HISTORY") {
  const retrievedAt = new Date().toISOString();
  const params = body.parameters.filter((p: Parameter) => !NON_SERIES.has(p.name));
  const series: UnifiedSeries[] = params.map((p) => {
    const metricKey = obscapeMetricKey(p.name);
    return {
      id: makeSeriesId(station.id, `${device}.${p.name}`),
      stationId: station.id,
      sensorId: `${station.id}#${device}`,
      metricKey,
      sourceKey: `${device}.${p.name}`,
      originalMetricName: `${p.caption ?? p.name} (${device})`,
      unit: canonicalUnitFor(metricKey, (p.unit ?? "").trim()),
      originalUnit: p.unit ?? null,
      statistic: null,
    };
  });
  const observations: UnifiedObservation[] = [];
  let lastFix: { lat: number; lon: number; at: string } | null = null;
  for (const row of body.data) {
    const invalid = row.invalid !== undefined && row.invalid !== null && String(row.invalid) !== "0";
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (!(p.name in row)) continue;
      const n = normalizeReading({ provider: P, series: series[i], rawValue: row[p.name], rawUnit: (p.unit ?? "").trim(), rawTime: row.time, origin, retrievedAt });
      if (!n.ok) continue;
      if (invalid) n.observation.qualityFlag = "provider_invalid";
      observations.push(n.observation);
    }
    const lat = parseNumeric(row.lat);
    const lon = parseNumeric(row.lon);
    const at = parseTimestamp(row.time);
    if (lat !== null && lon !== null && at && (!lastFix || at.toISOString() > lastFix.at)) lastFix = { lat, lon, at: at.toISOString() };
  }
  return { series, observations, lastFix, rowCount: body.data.length };
}

const utc = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

/** Camera data rows → frame list (oldest first, unique). Rows without a valid unix time are ignored. */
export function parseCameraFrames(body: ObscapeData): CameraFrame[] {
  const seen = new Set<number>();
  for (const row of body.data) {
    const t = Number(row.time);
    if (Number.isInteger(t) && t > 0) seen.add(t);
  }
  return [...seen].sort((a, b) => a - b).map((t) => ({ t, at: new Date(t * 1000).toISOString() }));
}

export class ObscapeAdapter implements MonitoringProviderAdapter {
  readonly provider = P;
  readonly isDemo = false;
  readonly capabilities = {
    discovery: "supported" as const,
    latest: "supported" as const,
    history: "supported" as const,
    notes: [
      "Obscape publishes no API v3 reference; the project → station → device → data contract was verified empirically against the live API (2026-11-13).",
      "Projects and stations are discovered automatically; OBSCAPE_PROJECTS optionally restricts which projects are included.",
      "Current readings come from each device's last 24 h; history uses from/to windows (UTC), fetched in 31-day chunks.",
      "TEMP / HUM are the logger's internal temperature and humidity and are kept separate from ambient air measurements.",
      "Rows the provider marks invalid are kept and flagged, not silently dropped.",
    ],
  };

  private get cfg() {
    return getEnv().obscape;
  }
  isConfigured() {
    return this.cfg.configured;
  }
  configuredDeviceCount() {
    return this.cfg.projects.length;
  }

  private requestUrl(params: Record<string, string>): URL {
    const u = new URL(this.cfg.baseUrl.replace("://www.obscape.com", "://obscape.com"));
    u.searchParams.set("username", this.cfg.username ?? "");
    u.searchParams.set("key", this.cfg.apiKey ?? "");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u;
  }

  private async call(params: Record<string, string>, op: string): Promise<{ body: unknown; latencyMs: number }> {
    const u = this.requestUrl(params);
    const res = await providerGet({ provider: P, url: u, op, timeoutMs: 60_000 });
    if (res.body === null || typeof res.body === "string") {
      throw new ProviderError({ provider: P, kind: "MALFORMED_RESPONSE", message: `${op}: response was empty or not JSON` });
    }
    return { body: res.body, latencyMs: res.latencyMs };
  }

  async listProjects(): Promise<ObscapeProject[]> {
    const { body } = await this.call({}, "projects");
    const r = z.array(ProjectSchema).safeParse(body);
    if (!r.success) throw new ProviderError({ provider: P, kind: "MALFORMED_RESPONSE", message: "projects: unexpected response shape" });
    const filter = this.cfg.projects.map((p) => p.toLowerCase());
    return filter.length ? r.data.filter((p) => filter.includes(p.name.toLowerCase())) : r.data;
  }

  async listStations(project: ObscapeProject): Promise<ObscapeStation[]> {
    const { body } = await this.call({ project: project.name }, "stations");
    if (!Array.isArray(body)) throw new ProviderError({ provider: P, kind: "MALFORMED_RESPONSE", message: "stations: expected an array" });
    const out: ObscapeStation[] = [];
    let rejected = 0;
    for (const item of body) {
      const r = StationSchema.safeParse(item);
      if (r.success) out.push(r.data);
      else rejected++;
    }
    if (rejected) log.warn("obscape.stations.rejected", { project: project.name, rejected });
    return out;
  }

  async fetchDeviceData(project: string, station: string, device: string, range?: { start: Date; end: Date }): Promise<ObscapeData> {
    const params: Record<string, string> = { project, station, device };
    if (range) {
      params.from = utc(range.start);
      params.to = utc(range.end);
    }
    const { body } = await this.call(params, "data");
    const r = DataResponseSchema.safeParse(body);
    if (!r.success) throw new ProviderError({ provider: P, kind: "MALFORMED_RESPONSE", message: `data(${device}): unexpected response shape` });
    return r.data;
  }

  /**
   * Frames a camera has captured in a window. Every camera data row corresponds to one stored
   * image, addressed by the row's unix `time`. Without a range the provider returns the last 24 h.
   */
  async listCameraFrames(project: string, station: string, range?: { start: Date; end: Date }): Promise<CameraFrame[]> {
    return parseCameraFrames(await this.fetchDeviceData(project, station, "camera", range));
  }

  /**
   * One camera image, exactly as the Obscape portal shows it: `image=latest` or `image=<unix time of a frame>`.
   * The provider answers an unknown time with an empty JSON array rather than an error status.
   */
  async fetchCameraImage(project: string, station: string, which: "latest" | number): Promise<{ bytes: Uint8Array; contentType: "image/jpeg" | "image/png" }> {
    const u = this.requestUrl({ project, station, device: "camera", image: String(which) });
    const res = await providerGet<unknown>({ provider: P, url: u, op: "camera_image", timeoutMs: 45_000, binary: true, headers: { Accept: "image/jpeg,image/png,image/*;q=0.8" } });
    const contentType = res.body instanceof Uint8Array ? sniffImageType(res.body) : null;
    if (!(res.body instanceof Uint8Array) || !contentType) {
      throw new ProviderError({ provider: P, kind: "DEVICE_NOT_FOUND", status: 404, message: which === "latest" ? "The camera has no image yet" : "No image is stored for that time" });
    }
    return { bytes: res.body, contentType };
  }

  async fetchSnapshot() {
    const base = { provider: P, isDemo: false, capabilities: this.capabilities, configuredDeviceCount: this.configuredDeviceCount() };
    if (!this.isConfigured()) {
      return { ...base, configured: false, stations: [], warnings: [], errors: [new ProviderError({ provider: P, kind: "MISSING_CREDENTIALS", message: "OBSCAPE_USERNAME and OBSCAPE_API_KEY are required" }).toJSON()] };
    }
    const errors: SerializedProviderError[] = [];
    const warnings: string[] = [];
    let projects: ObscapeProject[];
    try {
      projects = await this.listProjects();
    } catch (e) {
      return { ...base, configured: true, stations: [], warnings, errors: [serializeError(e, P)] };
    }
    if (this.cfg.projects.length && !projects.length) warnings.push("None of the projects in OBSCAPE_PROJECTS exist on this account.");

    const stations: StationSnapshot[] = [];
    for (const project of projects) {
      let list: ObscapeStation[];
      try {
        list = await this.listStations(project);
      } catch (e) {
        errors.push(serializeError(e, P));
        continue;
      }
      stations.push(...(await Promise.all(list.map((st) => this.snapshotStation(project, st)))));
    }
    return { ...base, configured: true, stations, errors, warnings };
  }

  private async snapshotStation(project: ObscapeProject, st: ObscapeStation): Promise<StationSnapshot> {
    const { station, sensors, deviceTypes } = obscapeStationRecord(project, st);
    const snap: StationSnapshot = { station, sensors, series: [], latest: [], errors: [] };
    for (const device of deviceTypes) {
      try {
        const data = await this.fetchDeviceData(project.name, st.id, device);
        const parsed = parseDeviceData(station, device, data, "PROVIDER_REALTIME");
        snap.series.push(...parsed.series);
        const latest = new Map<string, UnifiedObservation>();
        for (const o of parsed.observations) if (!latest.get(o.seriesId) || o.observedAt > latest.get(o.seriesId)!.observedAt) latest.set(o.seriesId, o);
        snap.latest.push(...latest.values());
        const sensor = sensors.find((s) => s.name === device);
        if (sensor) sensor.measurementTypes = [...new Set(parsed.series.map((s) => s.metricKey))];
        if (parsed.lastFix) station.metadata[`gps_${device}`] = parsed.lastFix;
      } catch (e) {
        snap.errors.push(serializeError(e, P));
      }
    }
    station.lastSeenAt = maxTime(snap.latest);
    return snap;
  }

  async fetchHistory(req: HistoryRequest): Promise<HistoryResult> {
    const project = String(req.station.metadata.project ?? req.station.projectName ?? "");
    const devices = [...new Set(req.series.map((s) => s.sourceKey.split(".")[0]))];
    const wanted = new Set(req.series.map((s) => s.id));
    const startIso = req.start.toISOString();
    const endIso = req.end.toISOString();
    const obs: UnifiedObservation[] = [];
    let requestCount = 0;
    for (const device of devices) {
      for (let t = req.start.getTime(); t < req.end.getTime(); t += CHUNK_MS) {
        const range = { start: new Date(t), end: new Date(Math.min(req.end.getTime(), t + CHUNK_MS)) };
        const data = await this.fetchDeviceData(project, req.station.externalId, device, range);
        requestCount++;
        const parsed = parseDeviceData(req.station, device, data, "PROVIDER_HISTORY");
        obs.push(...parsed.observations.filter((o) => wanted.has(o.seriesId) && o.observedAt >= startIso && o.observedAt <= endIso));
      }
    }
    return { observations: dedupeObservations(obs), resolution: "device sampling interval", truncated: false, notes: ["Provider history (Obscape API v3, from/to in UTC)."], requestCount };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.isConfigured()) {
      return { provider: P, configured: false, isDemo: false, status: "not_configured", checkedAt, latencyMs: null, steps: [{ name: "Configuration", status: "error", detail: "OBSCAPE_USERNAME / OBSCAPE_API_KEY not set" }], errors: [] };
    }
    const steps: ProviderHealth["steps"] = [{ name: "Configuration", status: "ok", detail: `Username set; ${this.cfg.projects.length ? `project filter: ${this.cfg.projects.length}` : "all projects"}` }];
    const errors: SerializedProviderError[] = [];
    let latency: number | null = null;
    let shape: unknown;
    try {
      const t0 = Date.now();
      const projects = await this.listProjects();
      latency = Date.now() - t0;
      steps.push({ name: "Authentication & project discovery", status: projects.length ? "ok" : "warn", detail: `${projects.length} project(s)` });
      let stationCount = 0;
      let sample: { project: string; station: string; device: string } | null = null;
      for (const p of projects) {
        const list = await this.listStations(p);
        stationCount += list.length;
        for (const s of list) {
          const d = s.devices && !Array.isArray(s.devices) ? Object.keys(s.devices) : [];
          if (!sample && d.length) sample = { project: p.name, station: s.id, device: d[0] };
        }
      }
      steps.push({ name: "Station discovery", status: stationCount ? "ok" : "warn", detail: `${stationCount} station(s)` });
      if (sample) {
        const data = await this.fetchDeviceData(sample.project, sample.station, sample.device, { start: new Date(Date.now() - 3 * 3_600_000), end: new Date() });
        shape = shapeOf(data, 0, 4);
        const newest = data.data
          .map((r) => parseTimestamp(r.time))
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        steps.push({
          name: `Observations (${sample.device})`,
          status: data.data.length ? "ok" : "warn",
          detail: data.data.length ? `${data.data.length} row(s) in last 3 h, ${data.parameters.length} parameters; newest ${newest?.toISOString() ?? "?"}` : "Successful response but no rows in the last 3 h",
        });
      }
    } catch (e) {
      errors.push(serializeError(e, P));
      steps.push({ name: "API request", status: "error", detail: (e as Error).message });
    }
    const status = errors.length ? "down" : steps.some((s) => s.status === "warn") ? "degraded" : "healthy";
    return { provider: P, configured: true, isDemo: false, status, checkedAt, latencyMs: latency, steps, errors, responseShape: shape };
  }
}
