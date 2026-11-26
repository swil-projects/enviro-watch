import "server-only";
import { z } from "zod";
import { getEnv } from "../../env";
import { providerGet } from "../../http";
import { canonicalUnitFor, dedupeObservations, maxTime, normalizeReading } from "../../normalize";
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
import { licorMetricKey, licorUtc } from "./mapping";

const P = "LICOR" as const;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Contract from the OpenAPI document served at https://api.licor.cloud/v1/docs/ (GET /v1/data).
export const LicorRecord = z.object({
  logger_sn: z.coerce.string(),
  sensor_sn: z.coerce.string().optional().nullable(),
  timestamp: z.union([z.string(), z.number()]),
  data_type: z.string().optional().nullable(),
  data_type_id: z.coerce.string().optional().nullable(),
  value: z.union([z.number(), z.string()]).nullable().optional(),
  unit: z.string().optional().nullable(),
  sensor_measurement_type: z.string().optional().nullable(),
});
export type LicorRecord = z.infer<typeof LicorRecord>;

export const LicorDataResponse = z.object({
  message: z.string().optional().nullable(),
  max_results: z.boolean().optional().nullable(),
  data: z.array(z.unknown()).optional().nullable(),
});

export interface LicorParsed {
  records: LicorRecord[];
  truncated: boolean;
  invalid: number;
  message?: string | null;
}

export function parseLicorResponse(body: unknown): LicorParsed {
  const r = LicorDataResponse.safeParse(body);
  if (!r.success) throw new ProviderError({ provider: P, kind: "MALFORMED_RESPONSE", message: "/v1/data response did not match the documented schema" });
  const records: LicorRecord[] = [];
  let invalid = 0;
  for (const item of r.data.data ?? []) {
    const p = LicorRecord.safeParse(item);
    if (p.success) records.push(p.data);
    else invalid++;
  }
  return { records, truncated: Boolean(r.data.max_results), invalid, message: r.data.message };
}

export function licorStation(loggerSn: string): UnifiedStation {
  return {
    id: makeStationId(P, loggerSn),
    provider: P,
    externalId: loggerSn,
    name: `LI-COR logger ${loggerSn}`,
    projectId: null,
    projectName: null,
    // The documented API exposes no logger location; coordinates are never invented.
    latitude: null,
    longitude: null,
    timezone: null,
    lastSeenAt: null,
    providerStatus: null,
    isDemo: false,
    metadata: { loggerSerial: loggerSn },
  };
}

export function licorSeriesFor(station: UnifiedStation, r: LicorRecord): { series: UnifiedSeries; sensor: UnifiedSensor } {
  const sensorSn = r.sensor_sn ?? "unknown";
  const typeId = r.data_type_id ?? r.data_type ?? "na";
  const sourceKey = `${sensorSn}:${typeId}`;
  const metricKey = licorMetricKey(r.sensor_measurement_type, r.data_type, r.unit);
  const sensorId = `${station.id}#${sensorSn}`;
  const name = [r.sensor_measurement_type, r.data_type].filter(Boolean).join(" · ") || sourceKey;
  return {
    sensor: { id: sensorId, stationId: station.id, externalId: sensorSn, name: r.sensor_measurement_type ? `${r.sensor_measurement_type} sensor` : `Sensor ${sensorSn}`, measurementTypes: [], metadata: { sensorSerial: sensorSn } },
    series: {
      id: makeSeriesId(station.id, sourceKey),
      stationId: station.id,
      sensorId,
      metricKey,
      sourceKey,
      originalMetricName: name,
      unit: canonicalUnitFor(metricKey, r.unit),
      originalUnit: r.unit ?? null,
      statistic: r.data_type ?? null,
    },
  };
}

export class LicorAdapter implements MonitoringProviderAdapter {
  readonly provider = P;
  readonly isDemo = false;
  readonly capabilities = {
    discovery: "unsupported" as const,
    latest: "supported" as const,
    history: "supported" as const,
    notes: [
      "The documented API (/v1/data) requires explicit logger serial numbers; there is no documented device-listing endpoint, so loggers come from LICOR_LOGGER_SERIALS.",
      "Sensors and measurement types are discovered dynamically from the returned observations.",
      "Latest readings are derived from the most recent observations in a short trailing window (the API has no dedicated 'latest' operation).",
      "Responses flagged max_results=true are truncated; the platform splits the window and re-requests so no observations are dropped.",
      "The API does not expose logger names or coordinates.",
    ],
  };

  private get cfg() {
    return getEnv().licor;
  }
  isConfigured() {
    return this.cfg.configured;
  }
  configuredDeviceCount() {
    return this.cfg.loggerSerials.length;
  }

  /** One raw /v1/data call. */
  async fetchRaw(loggers: string[], start: Date, end: Date, op = "data"): Promise<LicorParsed & { raw: unknown; latencyMs: number }> {
    const u = new URL("/v1/data", this.cfg.baseUrl);
    u.searchParams.set("loggers", loggers.join(","));
    u.searchParams.set("start_date_time", licorUtc(start));
    u.searchParams.set("end_date_time", licorUtc(end));
    const res = await providerGet({ provider: P, url: u, op, headers: { Authorization: `Bearer ${this.cfg.token}` }, timeoutMs: 45_000 });
    return { ...parseLicorResponse(res.body), raw: res.body, latencyMs: res.latencyMs };
  }

  /**
   * Fetch a window, splitting it recursively whenever the provider signals truncation.
   * Boundary semantics are not documented, so adjacent windows may overlap by a
   * boundary instant — duplicates are removed downstream.
   */
  async fetchWindow(loggers: string[], start: Date, end: Date, depth = 0): Promise<{ records: LicorRecord[]; requests: number; truncated: boolean; invalid: number }> {
    const r = await this.fetchRaw(loggers, start, end);
    const span = end.getTime() - start.getTime();
    if (!r.truncated) return { records: r.records, requests: 1, truncated: false, invalid: r.invalid };
    if (span <= HOUR || depth >= 8) return { records: r.records, requests: 1, truncated: true, invalid: r.invalid };
    const mid = new Date(start.getTime() + Math.floor(span / 2 / 1000) * 1000);
    const a = await this.fetchWindow(loggers, start, mid, depth + 1);
    const b = await this.fetchWindow(loggers, mid, end, depth + 1);
    return { records: [...a.records, ...b.records], requests: 1 + a.requests + b.requests, truncated: a.truncated || b.truncated, invalid: r.invalid + a.invalid + b.invalid };
  }

  private toSnapshots(loggers: string[], records: LicorRecord[], origin: "PROVIDER_REALTIME" | "PROVIDER_HISTORY") {
    const retrievedAt = new Date().toISOString();
    const snaps = new Map<string, StationSnapshot & { all: UnifiedObservation[] }>();
    for (const sn of loggers) snaps.set(sn, { station: licorStation(sn), sensors: [], series: [], latest: [], errors: [], all: [] });
    const sensorMap = new Map<string, UnifiedSensor>();
    const seriesMap = new Map<string, UnifiedSeries>();
    for (const r of records) {
      let snap = snaps.get(r.logger_sn);
      if (!snap) {
        snap = { station: licorStation(r.logger_sn), sensors: [], series: [], latest: [], errors: [], all: [] };
        snaps.set(r.logger_sn, snap);
      }
      const { series, sensor } = licorSeriesFor(snap.station, r);
      const n = normalizeReading({ provider: P, series: seriesMap.get(series.id) ?? series, rawValue: r.value, rawUnit: r.unit, rawTime: r.timestamp, origin, retrievedAt });
      // Records with an unusable timestamp don't establish sensors/series (no phantom sensors).
      if (!n.ok && n.reason === "invalid_timestamp") continue;
      if (!sensorMap.has(sensor.id)) {
        sensorMap.set(sensor.id, sensor);
        snap.sensors.push(sensor);
      }
      const s = sensorMap.get(sensor.id)!;
      if (!s.measurementTypes.includes(series.metricKey)) s.measurementTypes.push(series.metricKey);
      if (!seriesMap.has(series.id)) {
        seriesMap.set(series.id, series);
        snap.series.push(series);
      }
      if (n.ok) snap.all.push(n.observation);
    }
    return snaps;
  }

  async fetchSnapshot() {
    const errors: SerializedProviderError[] = [];
    const warnings: string[] = [];
    const base = { provider: P, isDemo: false, capabilities: this.capabilities, configuredDeviceCount: this.configuredDeviceCount() };
    if (!this.isConfigured()) {
      return { ...base, configured: false, stations: [], warnings, errors: [new ProviderError({ provider: P, kind: "MISSING_CREDENTIALS", message: "LICOR_API_TOKEN and at least one LICOR_LOGGER_SERIALS value are required" }).toJSON()] };
    }
    const loggers = this.cfg.loggerSerials;
    const end = new Date();
    const records: LicorRecord[] = [];
    let failed = false;
    // Short trailing window first; widen to 24 h only for loggers that returned nothing.
    try {
      records.push(...(await this.fetchWindow(loggers, new Date(end.getTime() - 3 * HOUR), end)).records);
    } catch (e) {
      errors.push(serializeError(e, P));
      failed = true;
    }
    if (!failed) {
      const seen = new Set(records.map((r) => r.logger_sn));
      const missing = loggers.filter((l) => !seen.has(l));
      if (missing.length) {
        try {
          records.push(...(await this.fetchWindow(missing, new Date(end.getTime() - DAY), end)).records);
        } catch (e) {
          errors.push(serializeError(e, P));
        }
      }
    }
    const snaps = this.toSnapshots(loggers, records, "PROVIDER_REALTIME");
    const stations: StationSnapshot[] = [];
    for (const snap of snaps.values()) {
      const latestBySeries = new Map<string, UnifiedObservation>();
      for (const o of snap.all) {
        const prev = latestBySeries.get(o.seriesId);
        if (!prev || o.observedAt > prev.observedAt) latestBySeries.set(o.seriesId, o);
      }
      snap.latest = [...latestBySeries.values()];
      snap.station.lastSeenAt = maxTime(snap.latest);
      if (!snap.latest.length && !failed) snap.station.providerStatus = "No observations in the last 24 h";
      if (failed) snap.errors = errors;
      stations.push({ station: snap.station, sensors: snap.sensors, series: snap.series, latest: snap.latest, errors: snap.errors });
    }
    return { ...base, configured: true, stations, errors, warnings };
  }

  async fetchHistory(req: HistoryRequest): Promise<HistoryResult> {
    const logger = req.station.externalId;
    const wanted = new Set(req.series.map((s) => s.id));
    const CHUNK = 7 * DAY;
    const records: LicorRecord[] = [];
    let requests = 0;
    let truncated = false;
    for (let t = req.start.getTime(); t < req.end.getTime(); t += CHUNK) {
      const r = await this.fetchWindow([logger], new Date(t), new Date(Math.min(req.end.getTime(), t + CHUNK)));
      records.push(...r.records);
      requests += r.requests;
      truncated ||= r.truncated;
    }
    const snap = this.toSnapshots([logger], records, "PROVIDER_HISTORY").get(logger);
    const obs = (snap?.all ?? []).filter((o) => wanted.size === 0 || wanted.has(o.seriesId));
    const notes = ["Provider history at the logger's native logging interval."];
    if (truncated) notes.push("Some windows were still truncated after splitting to 1 hour; data may be incomplete.");
    return { observations: dedupeObservations(obs), resolution: "logger interval", truncated, notes, requestCount: requests };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.isConfigured()) {
      const detail = !this.cfg.token ? "LICOR_API_TOKEN not set" : "LICOR_LOGGER_SERIALS not set";
      return { provider: P, configured: false, isDemo: false, status: "not_configured", checkedAt, latencyMs: null, steps: [{ name: "Configuration", status: "error", detail }], errors: [] };
    }
    const steps: ProviderHealth["steps"] = [{ name: "Configuration", status: "ok", detail: `${this.cfg.loggerSerials.length} logger serial(s) configured` }];
    const errors: SerializedProviderError[] = [];
    let latency: number | null = null;
    let shape: unknown;
    try {
      const end = new Date();
      const r = await this.fetchRaw(this.cfg.loggerSerials, new Date(end.getTime() - 2 * HOUR), end, "data(health)");
      latency = r.latencyMs;
      shape = shapeOf(r.raw);
      steps.push({ name: "Token validation (/v1/data)", status: "ok", detail: "Token accepted" });
      const byLogger = new Map<string, string>();
      for (const rec of r.records) {
        const ts = String(rec.timestamp);
        if (!byLogger.has(rec.logger_sn) || ts > byLogger.get(rec.logger_sn)!) byLogger.set(rec.logger_sn, ts);
      }
      for (const sn of this.cfg.loggerSerials) {
        const t = byLogger.get(sn);
        steps.push({ name: `Logger ${sn}`, status: t ? "ok" : "warn", detail: t ? `Latest observation ${t} (UTC)` : "No observations in the last 2 h (empty but successful response)" });
      }
      if (r.truncated) steps.push({ name: "Truncation", status: "warn", detail: "max_results=true on a 2 h window" });
      if (r.invalid) steps.push({ name: "Schema", status: "warn", detail: `${r.invalid} record(s) did not match the documented schema` });
    } catch (e) {
      errors.push(serializeError(e, P));
      steps.push({ name: "Token validation (/v1/data)", status: "error", detail: (e as Error).message });
    }
    const status = errors.length ? "down" : steps.some((s) => s.status === "warn") ? "degraded" : "healthy";
    return { provider: P, configured: true, isDemo: false, status, checkedAt, latencyMs: latency, steps, errors, responseShape: shape };
  }
}
