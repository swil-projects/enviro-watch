import { z } from "zod";
import { apiHandler, ok, RangeQuery, resolveRange, idList } from "@/lib/api";
import { getTimeseries } from "@/lib/timeseries";

const Q = RangeQuery.extend({
  metric: z.string().min(1).max(120),
  stations: idList.optional(),
  series: idList.optional(),
  maxPoints: z.coerce.number().int().min(50).max(2000).default(500),
});

export const GET = apiHandler(Q, async ({ query }) => {
  const { start, end } = resolveRange(query);
  return ok(await getTimeseries({ stationIds: query.stations ?? [], seriesIds: query.series, metricKey: query.metric, start, end, maxPoints: query.maxPoints }));
});
