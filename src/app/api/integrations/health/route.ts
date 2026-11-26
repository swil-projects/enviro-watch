import { z } from "zod";
import { apiHandler, ok } from "@/lib/api";
import { getHealth } from "@/lib/service";

export const GET = apiHandler(z.object({ force: z.enum(["0", "1"]).optional() }), async ({ query }) => ok(await getHealth(query.force === "1")));
