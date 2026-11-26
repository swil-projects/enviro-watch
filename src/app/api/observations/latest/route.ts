import { z } from "zod";
import { apiHandler, ok } from "@/lib/api";
import { getUnifiedSnapshot } from "@/lib/service";

const Q = z.object({
  provider: z.enum(["OBSCAPE", "LICOR", "ECOWITT"]).optional(),
  stationId: z.string().max(200).optional(),
  metric: z.string().max(120).optional(),
});

export const GET = apiHandler(Q, async ({ query }) => {
  const snap = await getUnifiedSnapshot();
  const obs = snap.stations
    .filter((s) => (!query.provider || s.station.provider === query.provider) && (!query.stationId || s.station.id === query.stationId))
    .flatMap((s) => s.latest)
    .filter((o) => !query.metric || o.metricKey === query.metric);
  return ok({ fetchedAt: snap.fetchedAt, isDemo: snap.isDemo, observations: obs });
});
