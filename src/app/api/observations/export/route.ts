import { z } from "zod";
import { apiHandler, fail, RangeQuery, resolveRange, idList } from "@/lib/api";
import { getHistory } from "@/lib/service";
import { toCsv } from "@/lib/csv";

const Q = RangeQuery.extend({
  stationId: z.string().min(1).max(200),
  series: idList.optional(),
  metric: z.string().max(120).optional(),
});

/** CSV export of normalized observations (with original values/units preserved). */
export const GET = apiHandler(Q, async ({ query }) => {
  const { start, end } = resolveRange(query);
  const h = await getHistory({ stationId: query.stationId, seriesIds: query.series, metricKeys: query.metric ? [query.metric] : undefined, start, end });
  if (h.error) return fail(h.error.kind, h.error.message, 502, h.error);
  const csv = toCsv(h.observations);
  const name = `observations_${query.stationId.replace(/[^a-z0-9-]/gi, "_")}_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
