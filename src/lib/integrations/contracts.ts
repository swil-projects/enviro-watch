import type { SerializedProviderError } from "./errors";

export type ProviderType = "OBSCAPE" | "LICOR" | "ECOWITT";
export const PROVIDERS: ProviderType[] = ["OBSCAPE", "LICOR", "ECOWITT"];

export const PROVIDER_META: Record<ProviderType, { name: string; slug: string; short: string; color: string }> = {
  OBSCAPE: { name: "Obscape", slug: "obscape", short: "OBS", color: "var(--provider-obscape)" },
  LICOR: { name: "LI-COR Cloud", slug: "licor", short: "LIC", color: "var(--provider-licor)" },
  ECOWITT: { name: "Ecowitt", slug: "ecowitt", short: "ECW", color: "var(--provider-ecowitt)" },
};

export function providerFromSlug(slug: string): ProviderType | null {
  const hit = (Object.keys(PROVIDER_META) as ProviderType[]).find((p) => PROVIDER_META[p].slug === slug);
  return hit ?? null;
}

/** Where an observation came from. Lets the UI distinguish provider history from real-time snapshots and demo data. */
export type ObservationOrigin = "PROVIDER_REALTIME" | "PROVIDER_HISTORY" | "DEMO";

export type CapabilityStatus = "supported" | "unsupported" | "unverified";

export interface ProviderCapabilities {
  /** Can the adapter discover stations/devices automatically from the account? */
  discovery: CapabilityStatus;
  latest: CapabilityStatus;
  history: CapabilityStatus;
  notes: string[];
}

export interface UnifiedStation {
  /** Globally unique, provider-scoped id: `<provider-slug>~<externalId>` */
  id: string;
  provider: ProviderType;
  externalId: string;
  name: string;
  projectId?: string | null;
  projectName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  /** Timestamp of the most recent observation (ISO, UTC). */
  lastSeenAt?: string | null;
  /** Provider-reported status string when the API exposes one (e.g. Ecowitt `device_status`). */
  providerStatus?: string | null;
  isDemo: boolean;
  metadata: Record<string, unknown>;
}

export interface UnifiedSensor {
  id: string;
  stationId: string;
  externalId: string;
  name: string;
  measurementTypes: string[];
  metadata: Record<string, unknown>;
}

/** One measured quantity on one station (optionally one sensor). */
export interface UnifiedSeries {
  /** `<stationId>|<sourceKey>` */
  id: string;
  stationId: string;
  sensorId?: string | null;
  metricKey: string;
  /** Provider-native identifier of this series, e.g. `outdoor.temperature` or `<sensor_sn>:<data_type_id>`. */
  sourceKey: string;
  originalMetricName: string;
  /** Canonical display unit after normalization. */
  unit: string;
  originalUnit?: string | null;
  /** Statistic the provider reports for the logging interval (e.g. LI-COR "Avg", "Max"), if any. */
  statistic?: string | null;
}

export interface UnifiedObservation {
  provider: ProviderType;
  stationId: string;
  seriesId: string;
  sensorId?: string | null;
  metricKey: string;
  originalMetricName: string;
  value: number;
  unit: string;
  originalValue?: number | string;
  originalUnit?: string | null;
  /** ISO 8601, UTC */
  observedAt: string;
  /** ISO 8601, UTC – when this application retrieved it from the provider. */
  retrievedAt: string;
  origin: ObservationOrigin;
  qualityFlag?: string | null;
}

export interface StationSnapshot {
  station: UnifiedStation;
  sensors: UnifiedSensor[];
  series: UnifiedSeries[];
  latest: UnifiedObservation[];
  errors: SerializedProviderError[];
}

export interface ProviderSnapshot {
  provider: ProviderType;
  configured: boolean;
  isDemo: boolean;
  capabilities: ProviderCapabilities;
  configuredDeviceCount: number;
  stations: StationSnapshot[];
  errors: SerializedProviderError[];
  warnings: string[];
  fetchedAt: string;
  durationMs: number;
  lastSuccessAt: string | null;
}

export interface HistoryRequest {
  station: UnifiedStation;
  series: UnifiedSeries[];
  start: Date;
  end: Date;
}

export interface HistoryResult {
  observations: UnifiedObservation[];
  /** Human readable provider resolution, e.g. "5 min" or "logger interval". */
  resolution: string;
  truncated: boolean;
  notes: string[];
  requestCount: number;
}

export interface HealthCheckStep {
  name: string;
  status: "ok" | "warn" | "error" | "skipped";
  detail: string;
}

export interface ProviderHealth {
  provider: ProviderType;
  configured: boolean;
  isDemo: boolean;
  status: "healthy" | "degraded" | "down" | "not_configured";
  checkedAt: string;
  latencyMs: number | null;
  steps: HealthCheckStep[];
  errors: SerializedProviderError[];
  /** Redacted structural sample of the most recent response (keys and value types only). */
  responseShape?: unknown;
}

export interface MonitoringProviderAdapter {
  readonly provider: ProviderType;
  readonly isDemo: boolean;
  readonly capabilities: ProviderCapabilities;
  isConfigured(): boolean;
  configuredDeviceCount(): number;
  /** Discover stations and fetch their latest readings. Must never throw for a single-station failure. */
  fetchSnapshot(): Promise<Omit<ProviderSnapshot, "fetchedAt" | "durationMs" | "lastSuccessAt">>;
  fetchHistory(req: HistoryRequest): Promise<HistoryResult>;
  healthCheck(): Promise<ProviderHealth>;
}

export function stationId(provider: ProviderType, externalId: string) {
  return `${PROVIDER_META[provider].slug}~${externalId}`;
}

export function seriesId(stationIdValue: string, sourceKey: string) {
  return `${stationIdValue}|${sourceKey}`;
}
