import { z } from "zod";
import { apiHandler, fail, ok, RangeQuery, resolveRange, idList } from "@/lib/api";
import { getHistory } from "@/lib/service";

const Q = RangeQuery.extend({
  stationId: z.string().min(1).max(200),
  series: idList.optional(),
  metric: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(500).default(100),
  order: z.enum(["asc", "desc"]).default("desc"),
});

/** Paginated raw observations for the data explorer table. */
export const GET = apiHandler(Q, async ({ query }) => {
  const { start, end } = resolveRange(query);
  const h = await getHistory({ stationId: query.stationId, seriesIds: query.series, metricKeys: query.metric ? [query.metric] : undefined, start, end });
  if (h.error) return fail(h.error.kind, h.error.message, 502, h.error);
  const rows = query.order === "desc" ? [...h.observations].reverse() : h.observations;
  const total = rows.length;
  return ok({
    total,
    page: query.page,
    pageSize: query.pageSize,
    resolution: h.resolution,
    truncated: h.truncated,
    notes: h.notes,
    series: h.series,
    rows: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
  });
});
