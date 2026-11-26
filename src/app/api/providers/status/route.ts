import { z } from "zod";
import { apiHandler, ok } from "@/lib/api";
import { getUnifiedSnapshot } from "@/lib/service";
import { providerSummaries } from "@/lib/overview";

export const GET = apiHandler(z.object({}), async () => ok(providerSummaries(await getUnifiedSnapshot())));
