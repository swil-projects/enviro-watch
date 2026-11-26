import { z } from "zod";
import { apiHandler, ok } from "@/lib/api";
import { getAlerts } from "@/lib/alerts";
import { getUnifiedSnapshot } from "@/lib/service";

export const GET = apiHandler(z.object({}), async () => ok(await getAlerts(await getUnifiedSnapshot())));
