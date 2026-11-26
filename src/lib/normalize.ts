import { getMetric } from "./metrics/registry";
import { toCanonical, unitDimension } from "./metrics/units";
import type { ObservationOrigin, ProviderType, UnifiedObservation, UnifiedSeries } from "./integrations/contracts";

/** Parse a provider numeric value. Returns null (never 0) for missing / invalid values. */
export function parseNumeric(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || /^(-|--|n\/?a|null|nan|none|undefined)$/i.test(t)) return null;
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Parse a timestamp to a UTC Date.
 *  - number / numeric string: unix seconds (10 digits) or milliseconds (13 digits)
 *  - ISO strings with offset: honoured
 *  - "yyyy-MM-dd HH:mm:ss" without offset: interpreted as `assumeZone` ("UTC" by default)
 */
export function parseTimestamp(v: unknown, assumeZone: "UTC" = "UTC"): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" || (typeof v === "string" && /^\d{9,13}(\.\d+)?$/.test(v.trim()))) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return sane(d);
  }
  if (typeof v !== "string") return null;
  let s = v.trim();
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  s = s.replace(" ", "T");
  if (!hasZone && assumeZone === "UTC") s += "Z";
  const d = new Date(s);
  return sane(d);
}

function sane(d: Date): Date | null {
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  // Reject obviously wrong timestamps (before 2000 or more than 1 day in the future).
  if (t < Date.UTC(2000, 0, 1) || t > Date.now() + 86_400_000) return null;
  return d;
}

export interface RawReading {
  provider: ProviderType;
  series: UnifiedSeries;
  rawValue: unknown;
  rawUnit: string | null | undefined;
  rawTime: unknown;
  origin: ObservationOrigin;
  retrievedAt: string;
}

export type NormalizeOutcome =
  | { ok: true; observation: UnifiedObservation }
  | { ok: false; reason: "missing_value" | "invalid_timestamp" };

export function normalizeReading(r: RawReading): NormalizeOutcome {
  const value = parseNumeric(r.rawValue);
  if (value === null) return { ok: false, reason: "missing_value" };
  const at = parseTimestamp(r.rawTime);
  if (!at) return { ok: false, reason: "invalid_timestamp" };

  const metric = getMetric(r.series.metricKey, r.series.originalMetricName, unitDimension(r.rawUnit) ?? "dimensionless");
  const conv = toCanonical(value, r.rawUnit, metric.dimension === "dimensionless" ? undefined : metric.dimension);
  const missingUnit = (r.rawUnit ?? "").trim() === "" && metric.dimension !== "dimensionless";
  let qualityFlag: string | null = missingUnit ? "missing_unit" : (conv.flag ?? null);
  if (!qualityFlag && metric.plausible && (conv.value < metric.plausible[0] || conv.value > metric.plausible[1])) {
    qualityFlag = "out_of_plausible_range";
  }
  return {
    ok: true,
    observation: {
      provider: r.provider,
      stationId: r.series.stationId,
      seriesId: r.series.id,
      sensorId: r.series.sensorId ?? null,
      metricKey: r.series.metricKey,
      originalMetricName: r.series.originalMetricName,
      value: round(conv.value, 6),
      unit: conv.unit,
      originalValue: typeof r.rawValue === "number" || typeof r.rawValue === "string" ? r.rawValue : undefined,
      originalUnit: r.rawUnit ?? null,
      observedAt: at.toISOString(),
      retrievedAt: r.retrievedAt,
      origin: r.origin,
      qualityFlag,
    },
  };
}

/** Canonical unit a series will be displayed in, given the provider's reported unit. */
export function canonicalUnitFor(metricKey: string, rawUnit: string | null | undefined): string {
  const m = getMetric(metricKey, undefined, unitDimension(rawUnit) ?? "dimensionless");
  return toCanonical(0, rawUnit, m.dimension === "dimensionless" ? undefined : m.dimension).unit;
}

/** Deduplicate by (seriesId, observedAt) keeping provider history over real-time snapshots; output sorted by time. */
export function dedupeObservations(obs: UnifiedObservation[]): UnifiedObservation[] {
  const map = new Map<string, UnifiedObservation>();
  for (const o of obs) {
    const k = `${o.seriesId}@${o.observedAt}`;
    const prev = map.get(k);
    if (!prev || (prev.origin !== "PROVIDER_HISTORY" && o.origin === "PROVIDER_HISTORY")) map.set(k, o);
  }
  return [...map.values()].sort((a, b) => (a.observedAt < b.observedAt ? -1 : a.observedAt > b.observedAt ? 1 : 0));
}

export function round(v: number, d = 3) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export function maxTime(obs: { observedAt: string }[]): string | null {
  let m: string | null = null;
  for (const o of obs) if (!m || o.observedAt > m) m = o.observedAt;
  return m;
}
