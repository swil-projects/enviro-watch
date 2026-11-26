import "server-only";
import { cached, getState, invalidate, peek, setState } from "./cache";
import { getEnv } from "./env";
import { log } from "./logger";
import { PROVIDERS, type HistoryResult, type MonitoringProviderAdapter, type ProviderHealth, type ProviderSnapshot, type ProviderType, type StationSnapshot, type UnifiedObservation, type UnifiedSeries } from "./integrations/contracts";
import { serializeError, type SerializedProviderError } from "./integrations/errors";
import { EcowittAdapter } from "./integrations/ecowitt/adapter";
import { LicorAdapter } from "./integrations/licor/adapter";
import { ObscapeAdapter } from "./integrations/obscape/adapter";
import { DemoAdapter } from "./integrations/demo/adapter";
import { prepareObservations } from "./analytics";
import { classifyFreshness, type Freshness } from "./freshness";

export type { Freshness } from "./freshness";

let adapters: Record<ProviderType, MonitoringProviderAdapter> | null = null;
export function getAdapters(): Record<ProviderType, MonitoringProviderAdapter> {
  if (adapters) return adapters;
  const demo = getEnv().demoMode;
  adapters = demo
    ? { OBSCAPE: new DemoAdapter("OBSCAPE"), LICOR: new DemoAdapter("LICOR"), ECOWITT: new DemoAdapter("ECOWITT") }
    : { OBSCAPE: new ObscapeAdapter(), LICOR: new LicorAdapter(), ECOWITT: new EcowittAdapter() };
  return adapters;
}

export interface StationView extends StationSnapshot {
  freshness: Freshness;
  ageMinutes: number | null;
}

export interface UnifiedSnapshot {
  fetchedAt: string;
  isDemo: boolean;
  providers: (ProviderSnapshot & { stale: boolean })[];
  stations: StationView[];
  refreshIntervalSeconds: number;
}

async function loadProvider(p: ProviderType): Promise<ProviderSnapshot> {
  const adapter = getAdapters()[p];
  const started = Date.now();
  try {
    const snap = await adapter.fetchSnapshot();
    const anyData = snap.stations.some((s) => s.latest.length > 0);
    const ok = snap.configured && (snap.errors.length === 0 || anyData);
    if (ok) setState(`lastSuccess:${p}`, new Date().toISOString());
    return { ...snap, fetchedAt: new Date().toISOString(), durationMs: Date.now() - started, lastSuccessAt: getState<string>(`lastSuccess:${p}`) ?? null };
  } catch (e) {
    log.error("provider.snapshot.failed", { provider: p, message: (e as Error).message });
    return {
      provider: p,
      configured: adapter.isConfigured(),
      isDemo: adapter.isDemo,
      capabilities: adapter.capabilities,
      configuredDeviceCount: adapter.configuredDeviceCount(),
      stations: [],
      errors: [serializeError(e, p)],
      warnings: [],
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      lastSuccessAt: getState<string>(`lastSuccess:${p}`) ?? null,
    };
  }
}

/**
 * Per-provider cached snapshot. If a refresh fails but a previous successful
 * snapshot exists, that previous data is returned and marked stale — real
 * (older) readings, clearly labelled, never substituted with fake values.
 */
async function providerSnapshot(p: ProviderType, force: boolean): Promise<ProviderSnapshot & { stale: boolean }> {
  const ttl = getEnv().refreshIntervalSeconds * 1000;
  const { value } = await cached(`snapshot:${p}`, ttl, () => loadProvider(p), { force });
  const failedNow = value.errors.length > 0 && !value.stations.some((s) => s.latest.length);
  if (failedNow) {
    const lastGood = getState<ProviderSnapshot>(`lastGood:${p}`);
    if (lastGood) return { ...lastGood, errors: value.errors, fetchedAt: value.fetchedAt, stale: true };
  } else if (value.configured) {
    setState(`lastGood:${p}`, value);
  }
  return { ...value, stale: false };
}

export async function getUnifiedSnapshot(opts: { force?: boolean } = {}): Promise<UnifiedSnapshot> {
  const env = getEnv();
  const providers = await Promise.all(PROVIDERS.map((p) => providerSnapshot(p, Boolean(opts.force))));
  const now = Date.now();
  const stations: StationView[] = providers.flatMap((ps) =>
    ps.stations.map((s) => {
      const age = s.station.lastSeenAt ? (now - Date.parse(s.station.lastSeenAt)) / 60_000 : null;
      return { ...s, ageMinutes: age === null ? null : Math.round(age), freshness: classifyFreshness(age, env.staleAfterMinutes, s.errors.length > 0 || ps.stale) };
    }),
  );
  return { fetchedAt: new Date(Math.min(...providers.map((p) => Date.parse(p.fetchedAt)))).toISOString(), isDemo: env.demoMode, providers, stations, refreshIntervalSeconds: env.refreshIntervalSeconds };
}

/** Manual refresh, rate-limited so repeated clicks / many users cannot hammer the providers. */
export async function refreshAll(): Promise<{ refreshed: boolean; retryInSeconds?: number }> {
  const MIN_INTERVAL = 30_000;
  const last = getState<number>("lastManualRefresh") ?? 0;
  if (Date.now() - last < MIN_INTERVAL) return { refreshed: false, retryInSeconds: Math.ceil((MIN_INTERVAL - (Date.now() - last)) / 1000) };
  setState("lastManualRefresh", Date.now());
  invalidate("snapshot:");
  invalidate("health:");
  await getUnifiedSnapshot({ force: true });
  return { refreshed: true };
}

export function lastSnapshotTime(): string | null {
  const times = PROVIDERS.map((p) => peek<ProviderSnapshot>(`snapshot:${p}`)?.value.fetchedAt).filter(Boolean) as string[];
  return times.length ? times.sort()[0] : null;
}

export async function getStation(id: string): Promise<{ view: StationView; provider: UnifiedSnapshot["providers"][number] } | null> {
  const snap = await getUnifiedSnapshot();
  const view = snap.stations.find((s) => s.station.id === id);
  if (!view) return null;
  return { view, provider: snap.providers.find((p) => p.provider === view.station.provider)! };
}

// ---------------------------------------------------------------- history

export interface HistoryQuery {
  stationId: string;
  /** Restrict to these series; if omitted, `metricKeys` or all series are used. */
  seriesIds?: string[];
  metricKeys?: string[];
  start: Date;
  end: Date;
}

export interface HistoryResponse extends HistoryResult {
  stationId: string;
  series: UnifiedSeries[];
  error?: SerializedProviderError;
  fromCache: boolean;
}

export function validateRange(start: Date, end: Date) {
  const env = getEnv();
  if (!(start instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new RangeError("Invalid date");
  end = new Date(Math.min(end.getTime(), Date.now()));
  if (end <= start) throw new RangeError("End must be after start and the range must begin in the past");
  const maxMs = env.maxHistoryDays * 86_400_000;
  if (end.getTime() - start.getTime() > maxMs) throw new RangeError(`Range exceeds the ${env.maxHistoryDays}-day limit`);
  return { start, end: end.getTime() > Date.now() ? new Date() : end };
}

export class NotFoundError extends Error {}

export async function getHistory(q: HistoryQuery): Promise<HistoryResponse> {
  const { start, end } = validateRange(q.start, q.end);
  const st = await getStation(q.stationId);
  if (!st) throw new NotFoundError("Unknown station");
  const { view } = st;
  let series = view.series;
  if (q.seriesIds?.length) series = series.filter((s) => q.seriesIds!.includes(s.id));
  else if (q.metricKeys?.length) series = series.filter((s) => q.metricKeys!.includes(s.metricKey));
  if (!series.length) return { stationId: q.stationId, series: [], observations: [], resolution: "n/a", truncated: false, notes: ["No matching series on this station."], requestCount: 0, fromCache: false };

  // Round to improve cache reuse: windows ending "now" snap to 5 minutes.
  const live = Date.now() - end.getTime() < 3_600_000;
  const r = live ? 300_000 : 60_000;
  const s0 = new Date(Math.floor(start.getTime() / r) * r);
  const e0 = new Date(Math.ceil(end.getTime() / r) * r);
  const key = `history:${q.stationId}:${series.map((s) => s.sourceKey).sort().join(",")}:${s0.getTime()}:${e0.getTime()}`;
  const ttl = live ? 120_000 : 30 * 60_000;
  const adapter = getAdapters()[view.station.provider];
  try {
    const { value, hit } = await cached(key, ttl, () => adapter.fetchHistory({ station: view.station, series, start: s0, end: e0 }));
    return { ...value, observations: prepareObservations(value.observations, start.getTime(), end.getTime()), stationId: q.stationId, series, fromCache: hit };
  } catch (e) {
    return { stationId: q.stationId, series, observations: [], resolution: "n/a", truncated: false, notes: [], requestCount: 0, error: serializeError(e, view.station.provider), fromCache: false };
  }
}

export async function getHealth(force = false): Promise<ProviderHealth[]> {
  return Promise.all(
    PROVIDERS.map(async (p) => {
      const { value } = await cached(`health:${p}`, 60_000, () => getAdapters()[p].healthCheck(), { force });
      return value;
    }),
  );
}

// ---------------------------------------------------------------- overview helpers

export function latestByMetric(stations: StationView[]): Map<string, { obs: UnifiedObservation; station: StationView }[]> {
  const m = new Map<string, { obs: UnifiedObservation; station: StationView }[]>();
  for (const s of stations) for (const o of s.latest) {
    const arr = m.get(o.metricKey) ?? [];
    arr.push({ obs: o, station: s });
    m.set(o.metricKey, arr);
  }
  return m;
}
