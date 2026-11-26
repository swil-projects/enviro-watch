import "server-only";
import { getMetric, METRICS } from "./metrics/registry";
import { PROVIDER_META, type ProviderType, type UnifiedObservation } from "./integrations/contracts";
import { cameraDevice } from "./camera";
import type { StationView, UnifiedSnapshot } from "./service";
import { getAlerts } from "./alerts";

export interface StationRow {
  id: string;
  name: string;
  provider: ProviderType;
  projectName: string | null;
  externalId: string;
  sensorCount: number;
  seriesCount: number;
  metrics: string[];
  lastSeenAt: string | null;
  ageMinutes: number | null;
  freshness: StationView["freshness"];
  latitude: number | null;
  longitude: number | null;
  providerStatus: string | null;
  isDemo: boolean;
  errorCount: number;
  /** The provider reported a camera device, so images can be shown. */
  hasCamera: boolean;
}

export function toStationRow(s: StationView): StationRow {
  return {
    id: s.station.id,
    name: s.station.name,
    provider: s.station.provider,
    projectName: s.station.projectName ?? null,
    externalId: s.station.externalId,
    sensorCount: s.sensors.length,
    seriesCount: s.series.length,
    metrics: [...new Set(s.series.map((x) => x.metricKey))],
    lastSeenAt: s.station.lastSeenAt ?? null,
    ageMinutes: s.ageMinutes,
    freshness: s.freshness,
    latitude: s.station.latitude ?? null,
    longitude: s.station.longitude ?? null,
    providerStatus: s.station.providerStatus ?? null,
    isDemo: s.station.isDemo,
    errorCount: s.errors.length,
    hasCamera: cameraDevice(s.station) !== null,
  };
}

export interface ProviderSummary {
  provider: ProviderType;
  name: string;
  slug: string;
  configured: boolean;
  isDemo: boolean;
  status: "connected" | "degraded" | "error" | "not_configured";
  configuredDeviceCount: number;
  discoveredCount: number;
  reportingCount: number;
  lastSuccessAt: string | null;
  lastObservationAt: string | null;
  fetchedAt: string;
  durationMs: number;
  stale: boolean;
  errors: UnifiedSnapshot["providers"][number]["errors"];
  warnings: string[];
  capabilities: UnifiedSnapshot["providers"][number]["capabilities"];
}

export function providerSummaries(snap: UnifiedSnapshot): ProviderSummary[] {
  return snap.providers.map((p) => {
    const views = snap.stations.filter((s) => s.station.provider === p.provider);
    const lastObs = views.map((v) => v.station.lastSeenAt).filter(Boolean).sort().at(-1) ?? null;
    const reporting = views.filter((v) => v.freshness === "live").length;
    const status: ProviderSummary["status"] = !p.configured ? "not_configured" : p.errors.length && !views.some((v) => v.latest.length) ? "error" : p.errors.length || p.stale || views.some((v) => v.errors.length) ? "degraded" : "connected";
    return {
      provider: p.provider,
      name: PROVIDER_META[p.provider].name,
      slug: PROVIDER_META[p.provider].slug,
      configured: p.configured,
      isDemo: p.isDemo,
      status,
      configuredDeviceCount: p.configuredDeviceCount,
      discoveredCount: views.length,
      reportingCount: reporting,
      lastSuccessAt: p.lastSuccessAt,
      lastObservationAt: lastObs,
      fetchedAt: p.fetchedAt,
      durationMs: p.durationMs,
      stale: p.stale,
      errors: p.errors,
      warnings: p.warnings,
      capabilities: p.capabilities,
    };
  });
}

export interface HeadlineMetric {
  metricKey: string;
  label: string;
  unit: string;
  decimals: number;
  kind: string;
  readings: { stationId: string; stationName: string; provider: ProviderType; seriesId: string; seriesLabel: string; value: number; observedAt: string; freshness: StationView["freshness"]; qualityFlag: string | null }[];
}

/** Headline metrics present in the data, ordered by the registry's headline order. */
export function headlineMetrics(snap: UnifiedSnapshot): HeadlineMetric[] {
  const byMetric = new Map<string, { o: UnifiedObservation; s: StationView }[]>();
  for (const s of snap.stations) for (const o of s.latest) {
    if (!METRICS[o.metricKey]?.headline) continue;
    const arr = byMetric.get(o.metricKey) ?? [];
    arr.push({ o, s });
    byMetric.set(o.metricKey, arr);
  }
  return [...byMetric.entries()]
    .sort((a, b) => (METRICS[a[0]].headline ?? 99) - (METRICS[b[0]].headline ?? 99))
    .map(([key, arr]) => {
      const m = getMetric(key);
      return {
        metricKey: key,
        label: m.shortLabel ?? m.label,
        unit: arr[0].o.unit,
        decimals: m.decimals,
        kind: m.kind,
        readings: arr
          .sort((a, b) => (a.o.observedAt < b.o.observedAt ? 1 : -1))
          .map(({ o, s }) => ({
            stationId: s.station.id,
            stationName: s.station.name,
            provider: s.station.provider,
            seriesId: o.seriesId,
            seriesLabel: o.originalMetricName,
            value: o.value,
            observedAt: o.observedAt,
            freshness: s.freshness,
            qualityFlag: o.qualityFlag ?? null,
          })),
      };
    });
}

export async function buildOverview(snap: UnifiedSnapshot) {
  const providers = providerSummaries(snap);
  const alerts = await getAlerts(snap);
  const stations = snap.stations;
  return {
    fetchedAt: snap.fetchedAt,
    isDemo: snap.isDemo,
    refreshIntervalSeconds: snap.refreshIntervalSeconds,
    kpis: {
      providersConnected: providers.filter((p) => p.status === "connected" || p.status === "degraded").length,
      providersConfigured: providers.filter((p) => p.configured).length,
      providersTotal: providers.length,
      stations: stations.length,
      reporting: stations.filter((s) => s.freshness === "live").length,
      stale: stations.filter((s) => s.freshness === "stale").length,
      offline: stations.filter((s) => s.freshness === "offline" || s.freshness === "error").length,
      liveReadings: stations.reduce((n, s) => n + s.latest.length, 0),
      activeAlerts: alerts.active.length,
      criticalAlerts: alerts.active.filter((a) => a.severity === "critical").length,
      lastSuccessAt: providers.map((p) => p.lastSuccessAt).filter(Boolean).sort().at(-1) ?? null,
    },
    diagnostics: {
      expectedSeries: stations.reduce((n, s) => n + s.series.length, 0),
      availableSeries: stations.reduce((n, s) => n + new Set(s.latest.map((o) => o.seriesId)).size, 0),
      flaggedReadings: stations.reduce((n, s) => n + s.latest.filter((o) => o.qualityFlag).length, 0),
      distinctMetrics: new Set(stations.flatMap((s) => s.series.map((x) => x.metricKey))).size,
    },
    providers,
    headline: headlineMetrics(snap),
    stations: stations.map(toStationRow),
    alerts: alerts.active.slice(0, 6),
  };
}

export type Overview = Awaited<ReturnType<typeof buildOverview>>;
