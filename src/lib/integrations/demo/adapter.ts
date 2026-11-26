import "server-only";
import { canonicalUnitFor, maxTime, normalizeReading } from "../../normalize";
import {
  PROVIDER_META,
  seriesId as makeSeriesId,
  stationId as makeStationId,
  type HistoryRequest,
  type HistoryResult,
  type MonitoringProviderAdapter,
  type ProviderHealth,
  type ProviderType,
  type StationSnapshot,
  type UnifiedObservation,
  type UnifiedSeries,
  type UnifiedStation,
} from "../contracts";

/**
 * DEMO MODE ONLY. Deterministic synthetic data used when DEMO_MODE=true so the
 * interface can be explored without credentials. Every station is flagged
 * `isDemo`, every observation has origin "DEMO", and the UI shows a persistent
 * banner. These adapters are never used as a fallback for a failing live API.
 */

interface DemoSeriesSpec {
  sourceKey: string;
  metricKey: string;
  unit: string;
  base: number;
  /** Diurnal amplitude */
  amp: number;
  /** Phase offset in hours (peak time, local). */
  peakHour?: number;
  noise: number;
  min?: number;
  max?: number;
  /** "rain" generates sparse showers; "direction" wraps 0–360; "tide" uses a semi-diurnal cycle. */
  mode?: "rain" | "direction" | "tide" | "counter";
  sensor?: string;
  statistic?: string;
}

interface DemoStationSpec {
  externalId: string;
  name: string;
  project?: string;
  lat: number | null;
  lon: number | null;
  intervalMin: number;
  series: DemoSeriesSpec[];
  /** Simulate an offline station: data stops this many hours ago. */
  offlineHours?: number;
}

const SPECS: Record<ProviderType, DemoStationSpec[]> = {
  OBSCAPE: [
    {
      externalId: "DEMO-BUOY-01",
      name: "Demo Wave Buoy — Harbour Approach",
      project: "Demo Coastal Project",
      lat: 17.925,
      lon: -76.84,
      intervalMin: 30,
      series: [
        { sourceKey: "Hm0", metricKey: "wave_height_significant", unit: "m", base: 0.9, amp: 0.25, peakHour: 15, noise: 0.08, min: 0.05 },
        { sourceKey: "Hmax", metricKey: "wave_height_max", unit: "m", base: 1.5, amp: 0.4, peakHour: 15, noise: 0.15, min: 0.1 },
        { sourceKey: "Tp", metricKey: "wave_period_peak", unit: "s", base: 7.5, amp: 1.0, peakHour: 4, noise: 0.5, min: 2 },
        { sourceKey: "DirP", metricKey: "wave_direction", unit: "deg", base: 110, amp: 15, noise: 6, mode: "direction" },
        { sourceKey: "WaterTemp", metricKey: "water_temperature", unit: "°C", base: 28.4, amp: 0.4, peakHour: 16, noise: 0.05 },
        { sourceKey: "Vbat", metricKey: "battery_voltage", unit: "V", base: 12.6, amp: 0.3, peakHour: 13, noise: 0.02 },
      ],
    },
    {
      externalId: "DEMO-WL-02",
      name: "Demo Tide Gauge — Inner Harbour",
      project: "Demo Coastal Project",
      lat: 17.968,
      lon: -76.79,
      intervalMin: 10,
      series: [
        { sourceKey: "WaterLevel", metricKey: "water_level", unit: "m", base: 0.15, amp: 0.18, noise: 0.01, mode: "tide" },
        { sourceKey: "WindSpeed", metricKey: "wind_speed", unit: "m/s", base: 4.5, amp: 2.5, peakHour: 14, noise: 0.8, min: 0 },
        { sourceKey: "WindDir", metricKey: "wind_direction", unit: "deg", base: 95, amp: 25, noise: 12, mode: "direction" },
        { sourceKey: "AirTemp", metricKey: "air_temperature", unit: "°C", base: 28.5, amp: 3, peakHour: 14, noise: 0.3 },
      ],
    },
  ],
  LICOR: [
    {
      externalId: "DEMO-21000001",
      name: "Demo LI-COR logger — Agro Station",
      lat: null,
      lon: null,
      intervalMin: 15,
      series: [
        { sourceKey: "21100001:1", metricKey: "air_temperature", unit: "°C", base: 26.8, amp: 4.2, peakHour: 14, noise: 0.25, sensor: "21100001", statistic: "Avg" },
        { sourceKey: "21100001:2", metricKey: "relative_humidity", unit: "%", base: 74, amp: -14, peakHour: 14, noise: 2, min: 20, max: 100, sensor: "21100001", statistic: "Avg" },
        { sourceKey: "21100002:1", metricKey: "solar_radiation", unit: "W/m²", base: 0, amp: 0, noise: 25, sensor: "21100002", statistic: "Avg" },
        { sourceKey: "21100003:1", metricKey: "rain_interval", unit: "mm", base: 0, amp: 0, noise: 0, mode: "rain", sensor: "21100003", statistic: "Sum" },
        { sourceKey: "21100004:1", metricKey: "wind_speed", unit: "m/s", base: 2.6, amp: 1.6, peakHour: 13, noise: 0.5, min: 0, sensor: "21100004", statistic: "Avg" },
        { sourceKey: "21100005:1", metricKey: "soil_moisture_vwc", unit: "m³/m³", base: 0.27, amp: -0.01, peakHour: 16, noise: 0.003, sensor: "21100005", statistic: "Sample" },
      ],
    },
  ],
  ECOWITT: [
    {
      externalId: "DE:M0:00:00:00:01",
      name: "Demo Ecowitt — Rooftop Weather",
      lat: 18.005,
      lon: -76.745,
      intervalMin: 5,
      series: [
        { sourceKey: "outdoor.temperature", metricKey: "air_temperature", unit: "°F", base: 82.5, amp: 6.5, peakHour: 14, noise: 0.4 },
        { sourceKey: "outdoor.humidity", metricKey: "relative_humidity", unit: "%", base: 72, amp: -12, peakHour: 14, noise: 2, min: 20, max: 100 },
        { sourceKey: "outdoor.dew_point", metricKey: "dew_point", unit: "°F", base: 72, amp: 1, peakHour: 14, noise: 0.3 },
        { sourceKey: "wind.wind_speed", metricKey: "wind_speed", unit: "mph", base: 8, amp: 5, peakHour: 14, noise: 1.5, min: 0 },
        { sourceKey: "wind.wind_gust", metricKey: "wind_gust", unit: "mph", base: 14, amp: 7, peakHour: 14, noise: 2.5, min: 0 },
        { sourceKey: "wind.wind_direction", metricKey: "wind_direction", unit: "º", base: 100, amp: 30, noise: 15, mode: "direction" },
        { sourceKey: "pressure.relative", metricKey: "pressure_sea_level", unit: "inHg", base: 29.98, amp: 0.03, peakHour: 10, noise: 0.005 },
        { sourceKey: "pressure.absolute", metricKey: "pressure_station", unit: "inHg", base: 29.6, amp: 0.03, peakHour: 10, noise: 0.005 },
        { sourceKey: "solar_and_uvi.solar", metricKey: "solar_radiation", unit: "W/m²", base: 0, amp: 0, noise: 30 },
        { sourceKey: "solar_and_uvi.uvi", metricKey: "uv_index", unit: "", base: 0, amp: 0, noise: 0 },
        { sourceKey: "rainfall.rain_rate", metricKey: "rain_rate", unit: "in/hr", base: 0, amp: 0, noise: 0, mode: "rain" },
        { sourceKey: "rainfall.daily", metricKey: "rain_daily", unit: "in", base: 0, amp: 0, noise: 0, mode: "counter" },
        { sourceKey: "indoor.temperature", metricKey: "indoor_air_temperature", unit: "°F", base: 77, amp: 1.5, peakHour: 16, noise: 0.2 },
        { sourceKey: "battery.wind_sensor", metricKey: "battery_voltage", unit: "V", base: 3.1, amp: 0.05, peakHour: 13, noise: 0.01 },
      ],
    },
    {
      externalId: "DE:M0:00:00:00:02",
      name: "Demo Ecowitt — Hillside (offline)",
      lat: 18.06,
      lon: -76.71,
      intervalMin: 5,
      offlineHours: 7,
      series: [
        { sourceKey: "outdoor.temperature", metricKey: "air_temperature", unit: "°F", base: 76, amp: 5, peakHour: 14, noise: 0.4 },
        { sourceKey: "outdoor.humidity", metricKey: "relative_humidity", unit: "%", base: 80, amp: -10, peakHour: 14, noise: 2, min: 20, max: 100 },
      ],
    },
  ],
};

// Deterministic pseudo-random in [-1, 1] from a string + number.
function noise(seed: string, n: number) {
  let h = 2166136261 ^ n;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

const JAM_OFFSET_H = -5; // demo data is shaped around Jamaica local time

function valueAt(spec: DemoSeriesSpec, seed: string, t: number): number {
  const localHour = (((t / 3_600_000 + JAM_OFFSET_H) % 24) + 24) % 24;
  const day = Math.floor((t / 3_600_000 + JAM_OFFSET_H) / 24);
  const sun = Math.max(0, Math.sin(((localHour - 6) / 12) * Math.PI)); // 06:00–18:00
  const bucket = Math.floor(t / 300_000);
  let v: number;
  switch (spec.mode) {
    case "tide":
      v = spec.base + spec.amp * Math.sin((2 * Math.PI * t) / (12.42 * 3_600_000)) + spec.noise * noise(seed, bucket);
      break;
    case "direction":
      v = spec.base + spec.amp * Math.sin((2 * Math.PI * t) / (30 * 3_600_000)) + spec.noise * noise(seed, bucket);
      v = ((v % 360) + 360) % 360;
      break;
    case "rain": {
      // A shower on ~30% of afternoons between 14:00 and 16:00 local.
      const showerDay = noise("rain-day", day) > 0.4;
      const inShower = showerDay && localHour >= 14 && localHour < 16;
      const intensity = inShower ? Math.max(0, 1 + noise(seed, bucket)) * (spec.unit === "in/hr" ? 0.35 : 1.6) : 0;
      v = intensity;
      break;
    }
    case "counter": {
      const showerDay = noise("rain-day", day) > 0.4;
      const progress = showerDay ? Math.min(1, Math.max(0, (localHour - 14) / 2)) : 0;
      v = progress * (0.6 + 0.3 * noise("rain-amt", day));
      break;
    }
    default: {
      if (spec.metricKey === "solar_radiation") v = 980 * sun * (0.85 + 0.15 * noise(seed, Math.floor(t / 1_800_000))) + spec.noise * noise(seed, bucket);
      else if (spec.metricKey === "uv_index") v = Math.round(11 * sun);
      else {
        const diurnal = Math.cos(((localHour - (spec.peakHour ?? 14)) / 24) * 2 * Math.PI);
        v = spec.base + spec.amp * diurnal + spec.noise * noise(seed, bucket);
      }
    }
  }
  if (spec.min !== undefined) v = Math.max(spec.min, v);
  if (spec.max !== undefined) v = Math.min(spec.max, v);
  return Math.round(v * 1000) / 1000;
}

export class DemoAdapter implements MonitoringProviderAdapter {
  readonly isDemo = true;
  readonly capabilities = { discovery: "supported" as const, latest: "supported" as const, history: "supported" as const, notes: ["Demo mode: deterministic synthetic data. Not real measurements."] };
  constructor(readonly provider: ProviderType) {}

  isConfigured() {
    return true;
  }
  configuredDeviceCount() {
    return SPECS[this.provider].length;
  }

  private station(spec: DemoStationSpec): UnifiedStation {
    return {
      id: makeStationId(this.provider, spec.externalId.replace(/:/g, "")),
      provider: this.provider,
      externalId: spec.externalId,
      name: spec.name,
      projectId: spec.project ?? null,
      projectName: spec.project ?? null,
      latitude: spec.lat,
      longitude: spec.lon,
      timezone: "America/Jamaica",
      lastSeenAt: null,
      providerStatus: null,
      isDemo: true,
      metadata: { demo: true, loggingIntervalMinutes: spec.intervalMin },
    };
  }

  private series(station: UnifiedStation, s: DemoSeriesSpec): UnifiedSeries {
    return {
      id: makeSeriesId(station.id, s.sourceKey),
      stationId: station.id,
      sensorId: s.sensor ? `${station.id}#${s.sensor}` : `${station.id}#${s.sourceKey.split(".")[0]}`,
      metricKey: s.metricKey,
      sourceKey: s.sourceKey,
      originalMetricName: s.sourceKey,
      unit: canonicalUnitFor(s.metricKey, s.unit),
      originalUnit: s.unit,
      statistic: s.statistic ?? null,
    };
  }

  private points(spec: DemoStationSpec, station: UnifiedStation, s: DemoSeriesSpec, start: number, end: number): UnifiedObservation[] {
    const step = spec.intervalMin * 60_000;
    const lastAvailable = Date.now() - (spec.offlineHours ?? 0) * 3_600_000;
    const series = this.series(station, s);
    const out: UnifiedObservation[] = [];
    const retrievedAt = new Date().toISOString();
    for (let t = Math.ceil(start / step) * step; t <= Math.min(end, lastAvailable); t += step) {
      // Simulate a short telemetry gap once a day for realism in completeness metrics.
      if (Math.floor(t / 3_600_000) % 24 === 3 && spec.intervalMin <= 10) continue;
      const n = normalizeReading({ provider: this.provider, series, rawValue: valueAt(s, station.id + s.sourceKey, t), rawUnit: s.unit, rawTime: t, origin: "DEMO", retrievedAt });
      if (n.ok) out.push(n.observation);
    }
    return out;
  }

  async fetchSnapshot() {
    const now = Date.now();
    const stations: StationSnapshot[] = SPECS[this.provider].map((spec) => {
      const station = this.station(spec);
      const series = spec.series.map((s) => this.series(station, s));
      const latest = spec.series
        .map((s) => this.points(spec, station, s, now - spec.intervalMin * 60_000 * 2 - (spec.offlineHours ?? 0) * 3_600_000, now).at(-1))
        .filter((o): o is UnifiedObservation => Boolean(o));
      station.lastSeenAt = maxTime(latest);
      const sensorIds = [...new Set(series.map((s) => s.sensorId!))];
      return {
        station,
        series,
        latest,
        errors: [],
        sensors: sensorIds.map((id) => ({ id, stationId: station.id, externalId: id.split("#")[1], name: id.split("#")[1], measurementTypes: series.filter((s) => s.sensorId === id).map((s) => s.metricKey), metadata: { demo: true } })),
      };
    });
    return { provider: this.provider, configured: true, isDemo: true, capabilities: this.capabilities, configuredDeviceCount: stations.length, stations, errors: [], warnings: [] };
  }

  async fetchHistory(req: HistoryRequest): Promise<HistoryResult> {
    const spec = SPECS[this.provider].find((s) => this.station(s).id === req.station.id);
    if (!spec) return { observations: [], resolution: "n/a", truncated: false, notes: [], requestCount: 0 };
    const wanted = new Set(req.series.map((s) => s.sourceKey));
    const obs = spec.series.filter((s) => wanted.size === 0 || wanted.has(s.sourceKey)).flatMap((s) => this.points(spec, req.station, s, req.start.getTime(), req.end.getTime()));
    return { observations: obs, resolution: `${spec.intervalMin} min`, truncated: false, notes: ["Demo data — synthetic, not real measurements."], requestCount: 0 };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.provider,
      configured: true,
      isDemo: true,
      status: "healthy",
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      steps: [{ name: "Demo mode", status: "warn", detail: `${PROVIDER_META[this.provider].name} is serving synthetic demo data. No API calls are made.` }],
      errors: [],
    };
  }
}
