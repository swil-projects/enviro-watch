import "server-only";
import { bucketize, chooseBucketMs, computeStats, computeInsights, prepareObservations, findGaps, type SeriesInsights, type Gap, type Stats } from "./analytics";
import { getMetric, type MetricDefinition } from "./metrics/registry";
import type { ObservationOrigin, ProviderType } from "./integrations/contracts";
import type { SerializedProviderError } from "./integrations/errors";
import { getHistory, getUnifiedSnapshot, NotFoundError, validateRange } from "./service";

export interface TimeseriesLine {
  seriesId: string;
  stationId: string;
  stationName: string;
  provider: ProviderType;
  label: string;
  unit: string;
  originalUnit: string | null;
  statistic: string | null;
  origin: ObservationOrigin | null;
  /** [epoch ms, value | null]; nulls mark gaps so charts break the line. */
  points: [number, number | null][];
  aggregated: boolean;
  stats: Stats;
  insights: SeriesInsights;
  gaps: Gap[];
  completeness: number | null;
  intervalMinutes: number | null;
  resolution: string;
  notes: string[];
  truncated: boolean;
  error?: SerializedProviderError;
  /** Excluded from the shared axis because its unit differs from the metric's canonical unit. */
  incompatible?: string;
}

export interface TimeseriesResult {
  metric: MetricDefinition;
  start: string;
  end: string;
  bucketMs: number;
  lines: TimeseriesLine[];
}

/**
 * Fetch provider history for one metric across several stations and prepare it
 * for charting / comparison. Lines whose unit can't be reconciled are flagged
 * rather than plotted on the same axis.
 */
export async function getTimeseries(opts: { stationIds: string[]; metricKey: string; start: Date; end: Date; maxPoints?: number; seriesIds?: string[] }): Promise<TimeseriesResult> {
  // Validate up front so an invalid / over-limit range is a 400, not N silently-empty lines.
  const window = validateRange(opts.start, opts.end);
  const metric = getMetric(opts.metricKey);
  const maxPoints = opts.maxPoints ?? 500;
  const snap = await getUnifiedSnapshot();
  const stationIds = opts.stationIds.length
    ? opts.stationIds
    : snap.stations.filter((s) => s.series.some((x) => x.metricKey === opts.metricKey)).map((s) => s.station.id).slice(0, 8);

  const histories = await Promise.all(
    stationIds.map((id) => getHistory({ stationId: id, metricKeys: [opts.metricKey], seriesIds: opts.seriesIds?.filter((s) => s.startsWith(id + "|")), start: window.start, end: window.end }).catch((e) => {
        if (e instanceof NotFoundError) return null; // unknown station id: skipped
        throw e;
      })),
  );

  const startMs = window.start.getTime();
  const endMs = window.end.getTime();
  const bucketMs = chooseBucketMs(endMs - startMs, maxPoints);
  const lines: TimeseriesLine[] = [];

  histories.forEach((h, i) => {
    const station = snap.stations.find((s) => s.station.id === stationIds[i]);
    if (!h || !station) return;
    for (const series of h.series) {
      const obs = prepareObservations(h.observations.filter((o) => o.seriesId === series.id), startMs, endMs);
      const { gaps, intervalMs, completeness } = findGaps(obs, startMs, endMs);
      const aggregated = obs.length > maxPoints;
      let points: [number, number | null][];
      if (aggregated) {
        points = bucketize(obs, bucketMs, startMs, endMs, metric).map((b) => [b.t, b.value]);
      } else {
        points = [];
        const gapStarts = new Set(gaps.map((g) => Date.parse(g.start)));
        for (const o of obs) {
          const t = Date.parse(o.observedAt);
          points.push([t, o.value]);
          if (gapStarts.has(t)) points.push([t + 1, null]);
        }
      }
      lines.push({
        seriesId: series.id,
        stationId: station.station.id,
        stationName: station.station.name,
        provider: station.station.provider,
        label: `${station.station.name} · ${series.originalMetricName}`,
        unit: series.unit,
        originalUnit: series.originalUnit ?? null,
        statistic: series.statistic ?? null,
        origin: obs[0]?.origin ?? null,
        points,
        aggregated,
        stats: computeStats(obs, metric),
        insights: computeInsights(obs, metric),
        gaps,
        completeness,
        intervalMinutes: intervalMs ? Math.round(intervalMs / 60_000) : null,
        resolution: h.resolution,
        notes: h.notes,
        truncated: h.truncated,
        error: h.error,
      });
    }
  });

  // Unit compatibility on a shared axis: majority unit wins, others are flagged.
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.unit, (counts.get(l.unit) ?? 0) + 1);
  const axisUnit = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const l of lines) if (axisUnit !== undefined && l.unit !== axisUnit) l.incompatible = `Unit ${l.unit || "(none)"} differs from axis unit ${axisUnit}`;

  return { metric, start: opts.start.toISOString(), end: new Date(endMs).toISOString(), bucketMs, lines };
}
