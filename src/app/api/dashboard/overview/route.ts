import { z } from "zod";
import { apiHandler, ok } from "@/lib/api";
import { buildOverview } from "@/lib/overview";
import { getUnifiedSnapshot } from "@/lib/service";

export const GET = apiHandler(z.object({}), async () => {
  const snap = await getUnifiedSnapshot();
  return ok(await buildOverview(snap));
});
