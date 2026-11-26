import { z } from "zod";
import { apiHandler, ok } from "@/lib/api";
import { getUnifiedSnapshot } from "@/lib/service";

export const GET = apiHandler(z.object({}), async () => {
  const snap = await getUnifiedSnapshot();
  return ok({ fetchedAt: snap.fetchedAt, isDemo: snap.isDemo, refreshIntervalSeconds: snap.refreshIntervalSeconds, stations: snap.stations });
});
