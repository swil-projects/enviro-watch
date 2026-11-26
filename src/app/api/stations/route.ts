import { z } from "zod";
import { apiHandler, ok } from "@/lib/api";
import { getUnifiedSnapshot } from "@/lib/service";
import { toStationRow } from "@/lib/overview";

const Q = z.object({
  provider: z.enum(["OBSCAPE", "LICOR", "ECOWITT"]).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = apiHandler(Q, async ({ query }) => {
  const snap = await getUnifiedSnapshot();
  let rows = snap.stations.map(toStationRow);
  if (query.provider) rows = rows.filter((r) => r.provider === query.provider);
  if (query.q) {
    const needle = query.q.toLowerCase();
    rows = rows.filter((r) => [r.name, r.externalId, r.projectName ?? ""].some((v) => v.toLowerCase().includes(needle)));
  }
  const total = rows.length;
  rows = rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  return ok({ total, page: query.page, pageSize: query.pageSize, rows });
});
