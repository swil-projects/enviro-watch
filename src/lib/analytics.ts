import { getMetric, type MetricDefinition } from "./metrics/registry";
import type { UnifiedObservation } from "./integrations/contracts";

/**
 * Pure analytics helpers. All functions respect metric kinds:
 *  - directions use circular statistics
 *  - interval totals are summed per bucket
 *  - running totals (counters) use the last value per bucket; never summed/averaged
 */

export interface Stats {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  /** Sum is only reported for interval totals; null otherwise. */
  total: number | null;
  first: string | null;
  last: string | null;
}

export function circularMean(degrees: number[]): number | null {
  if (!degrees.length) return null;
  let s = 0;
  let c = 0;
  for (const d of degrees) {
    s += Math.sin((d * Math.PI) / 180);
    c += Math.cos((d * Math.PI) / 180);
  }
  if (Math.abs(s) < 1e-12 && Math.abs(c) < 1e-12) return null; // undefined (opposing directions)
  const m = (Math.atan2(s / degrees.length, c / degrees.length) * 180) / Math.PI;
  return (m + 360) % 360;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function computeStats(obs: UnifiedObservation[], metric: MetricDefinition): Stats {
  const values = obs.map((o) => o.value);
  const empty: Stats = { count: 0, min: null, max: null, mean: null, median: null, total: null, first: null, last: null };
  if (!values.length) return empty;
  const sorted = [...obs].sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1));
  const base = { count: values.length, first: sorted[0].observedAt, last: sorted.at(-1)!.observedAt };
  if (metric.kind === "direction") {
    return { ...base, min: null, max: null, mean: circularMean(values), median: null, total: null };
  }
  const min = values.reduce((a, b) => Math.min(a, b), Infinity);
  const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
  if (metric.kind === "running_total" || metric.kind === "state") {
    return { ...base, min, max, mean: null, median: null, total: null };
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { ...base, min, max, mean, median: median(values), total: metric.kind === "interval_total" ? values.reduce((a, b) => a + b, 0) : null };
}

export interface Bucket {
  t: number; // bucket start (ms)
  value: number | null; // representative value for charts
  min: number | null;
  max: number | null;
  count: number;
}

/** Aggregate observations into fixed buckets using the metric-appropriate statistic. Empty buckets are emitted as null (gaps). */
export function bucketize(obs: UnifiedObservation[], bucketMs: number, start: number, end: number, metric: MetricDefinition): Bucket[] {
  const n = Math.max(1, Math.ceil((end - start) / bucketMs));
  const groups: number[][] = Array.from({ length: n }, () => []);
  const lastVal: (number | null)[] = Array(n).fill(null);
  const lastT: number[] = Array(n).fill(-Infinity);
  for (const o of obs) {
    const t = Date.parse(o.observedAt);
    const i = Math.floor((t - start) / bucketMs);
    if (!Number.isFinite(t) || !Number.isFinite(o.value) || t >= end || i < 0 || i >= n) continue;
    groups[i].push(o.value);
    if (t >= lastT[i]) {
      lastT[i] = t;
      lastVal[i] = o.value;
    }
  }
  return groups.map((g, i) => {
    const t = start + i * bucketMs;
    if (!g.length) return { t, value: null, min: null, max: null, count: 0 };
    let value: number | null;
    switch (metric.kind) {
      case "direction":
        value = circularMean(g);
        break;
      case "interval_total":
        value = g.reduce((a, b) => a + b, 0);
        break;
      case "running_total":
      case "state":
        value = lastVal[i];
        break;
      default:
        value = g.reduce((a, b) => a + b, 0) / g.length;
    }
    return { t, value, min: metric.kind === "direction" ? null : Math.min(...g), max: metric.kind === "direction" ? null : Math.max(...g), count: g.length };
  });
}

/** Choose a "nice" bucket size so a chart has at most `maxPoints` points. */
export function chooseBucketMs(spanMs: number, maxPoints = 400): number {
  const nice = [60_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000, 604_800_000];
  for (const b of nice) if (spanMs / b <= maxPoints) return b;
  return nice.at(-1)!;
}

/** Typical reporting interval = median spacing between consecutive observations. */
export function typicalIntervalMs(obs: UnifiedObservation[]): number | null {
  if (obs.length < 3) return null;
  const ts = obs.map((o) => Date.parse(o.observedAt)).sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) diffs.push(ts[i] - ts[i - 1]);
  return median(diffs);
}

export interface Gap {
  start: string;
  end: string;
  durationMinutes: number;
}

/** Gaps longer than `factor` × the typical interval (including leading/trailing gaps in the window). */
export function findGaps(obs: UnifiedObservation[], start: number, end: number, factor = 2.5): { gaps: Gap[]; intervalMs: number | null; completeness: number | null } {
  const interval = typicalIntervalMs(obs);
  if (!interval) return { gaps: [], intervalMs: null, completeness: obs.length ? null : 0 };
  const ts = [...new Set(obs.map((o) => Date.parse(o.observedAt)))].sort((a, b) => a - b);
  const gaps: Gap[] = [];
  const pushGap = (a: number, b: number) => {
    if (b - a > factor * interval) gaps.push({ start: new Date(a).toISOString(), end: new Date(b).toISOString(), durationMinutes: Math.round((b - a) / 60_000) });
  };
  pushGap(start, ts[0]);
  for (let i = 1; i < ts.length; i++) pushGap(ts[i - 1], ts[i]);
  pushGap(ts.at(-1)!, end);
  const expected = Math.max(1, Math.floor((end - start) / interval));
  const completeness = Math.min(1, ts.length / expected);
  return { gaps, intervalMs: interval, completeness };
}

/** Compare two equal-length periods for the same metric (e.g. last 24 h vs previous 24 h). */
export function periodChange(current: Stats, previous: Stats, metricKey: string) {
  const m = getMetric(metricKey);
  const pick = (s: Stats) => (m.kind === "interval_total" ? s.total : m.kind === "instantaneous" || m.kind === "rate" ? s.mean : null);
  const a = pick(current);
  const b = pick(previous);
  if (a === null || b === null) return null;
  return { current: a, previous: b, delta: a - b, basis: m.kind === "interval_total" ? "total" : "mean" };
}

/**
 * Align several series onto a common time grid for cross-station comparison.
 * Each series is resampled to the grid with its metric-appropriate bucket statistic.
 */
export function alignSeries(seriesObs: UnifiedObservation[][], metricKey: string, start: number, end: number, bucketMs: number) {
  const metric = getMetric(metricKey);
  return seriesObs.map((obs) => bucketize(obs, bucketMs, start, end, metric));
}


/** Sort, reject invalid/out-of-window samples and keep the last retrieved duplicate.
 * Windows are half-open [start, end), so adjacent period totals never overlap.
 */
export function prepareObservations(obs: UnifiedObservation[], start: number, end: number): UnifiedObservation[] {
  const unique = new Map<string, UnifiedObservation>();
  for (const o of obs) {
    const t = Date.parse(o.observedAt);
    if (!Number.isFinite(o.value) || !Number.isFinite(t) || t < start || t >= end) continue;
    const key = `${o.seriesId}|${t}`;
    const previous = unique.get(key);
    if (!previous || (Date.parse(o.retrievedAt) || 0) >= (Date.parse(previous.retrievedAt) || 0)) unique.set(key, o);
  }
  return [...unique.values()].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

export interface SeriesInsights {
  p10: number | null;
  p90: number | null;
  standardDeviation: number | null;
  outlierCount: number | null;
  flaggedCount: number;
  latest: number | null;
  trend: { perHour: number; rSquared: number } | null;
}

/** Linear interpolation between ordered samples (R-7 quantiles). */
export function quantile(sorted: number[], probability: number): number | null {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * Math.max(0, Math.min(1, probability));
  const lo = Math.floor(index);
  return sorted[lo] + (sorted[Math.ceil(index)] - sorted[lo]) * (index - lo);
}

/** Descriptive sample statistics, never forecasts or environmental safety thresholds. */
export function computeInsights(obs: UnifiedObservation[], metric: MetricDefinition): SeriesInsights {
  const sorted = [...obs].filter((o) => Number.isFinite(o.value) && Number.isFinite(Date.parse(o.observedAt))).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const result: SeriesInsights = {
    p10: null, p90: null, standardDeviation: null, outlierCount: null,
    flaggedCount: sorted.filter((o) => Boolean(o.qualityFlag)).length,
    latest: sorted.at(-1)?.value ?? null, trend: null,
  };
  // Arithmetic spread and regression do not apply to directions, counters or states.
  if (!sorted.length || !["instantaneous", "rate"].includes(metric.kind)) return result;
  const values = sorted.map((o) => o.value).sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const ssY = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  result.p10 = quantile(values, 0.1);
  result.p90 = quantile(values, 0.9);
  result.standardDeviation = values.length > 1 ? Math.sqrt(ssY / (values.length - 1)) : null;
  if (values.length >= 8) {
    const q1 = quantile(values, 0.25)!;
    const q3 = quantile(values, 0.75)!;
    const iqr = q3 - q1;
    result.outlierCount = values.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).length;
  }
  if (sorted.length >= 3) {
    const t0 = Date.parse(sorted[0].observedAt);
    const xs = sorted.map((o) => (Date.parse(o.observedAt) - t0) / 3_600_000);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const ssX = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
    const covariance = xs.reduce((sum, x, i) => sum + (x - meanX) * (sorted[i].value - mean), 0);
    if (ssX > 0) result.trend = { perHour: covariance / ssX, rSquared: ssY > 0 ? Math.max(0, Math.min(1, covariance ** 2 / (ssX * ssY))) : 0 };
  }
  return result;
}
