import { z } from "zod";
import { apiHandler, ok, RangeQuery, resolveRange, idList } from "@/lib/api";
import { getTimeseries } from "@/lib/timeseries";
import { validateRange } from "@/lib/service";
import { periodChange } from "@/lib/analytics";

const Q = RangeQuery.extend({ metric: z.string().min(1).max(120), stations: idList.optional() });

/** Statistics for the selected period and the equal-length period immediately before it. */
export const GET = apiHandler(Q, async ({ query }) => {
  const requested = resolveRange(query);
  const { start, end } = validateRange(requested.start, requested.end);
  const span = end.getTime() - start.getTime();
  const [cur, prev] = await Promise.all([
    getTimeseries({ stationIds: query.stations ?? [], metricKey: query.metric, start, end }),
    getTimeseries({ stationIds: query.stations ?? [], metricKey: query.metric, start: new Date(start.getTime() - span), end: start }),
  ]);
  return ok({
    metric: cur.metric,
    start: cur.start,
    end: cur.end,
    lines: cur.lines.map((l) => {
      const p = prev.lines.find((x) => x.seriesId === l.seriesId);
      const warnings = [
        ...(l.truncated ? ["Current history truncated"] : []),
        ...(p?.truncated ? ["Previous history truncated"] : []),
        ...(l.error ? ["Current history unavailable"] : []),
        ...(p?.error ? ["Previous history unavailable"] : []),
        ...(l.completeness !== null && l.completeness < 0.8 ? ["Current coverage below 80%"] : []),
        ...(p && p.completeness !== null && p.completeness < 0.8 ? ["Previous coverage below 80%"] : []),
        ...(!p || !p.stats.count ? ["No previous observations"] : []),
      ];
      return { warnings, previousCompleteness: p?.completeness ?? null, seriesId: l.seriesId, label: l.label, provider: l.provider, unit: l.unit, current: l.stats, previous: p?.stats ?? null, change: p && p.unit === l.unit && !l.error && !p.error ? periodChange(l.stats, p.stats, query.metric) : null, completeness: l.completeness, gaps: l.gaps.length };
    }),
  });
});
