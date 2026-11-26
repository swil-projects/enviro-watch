import "server-only";
import { z } from "zod";
import { authorizeApi, type SessionUser } from "./auth/session";
import { log } from "./logger";
import { NotFoundError } from "./service";

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, { ...init, headers: { "Cache-Control": "private, no-store", ...(init?.headers ?? {}) } });
}

export function fail(code: string, message: string, status: number, details?: unknown) {
  return Response.json({ error: { code, message, details } }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Wrap a handler with authentication, Zod query validation and uniform error handling. */
export function apiHandler<S extends z.ZodType>(
  schema: S,
  fn: (args: { query: z.infer<S>; user: SessionUser; req: Request }) => Promise<Response>,
) {
  return async (req: Request) => {
    const auth = await authorizeApi();
    if ("response" in auth) return auth.response;
    const params = Object.fromEntries(new URL(req.url).searchParams);
    const parsed = schema.safeParse(params);
    if (!parsed.success) return fail("INVALID_QUERY", "Invalid query parameters", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    try {
      return await fn({ query: parsed.data, user: auth.user, req });
    } catch (e) {
      if (e instanceof RangeError) return fail("INVALID_RANGE", e.message, 400);
      if (e instanceof NotFoundError) return fail("NOT_FOUND", e.message, 404);
      log.error("api.unhandled", { path: new URL(req.url).pathname, message: (e as Error).message });
      return fail("INTERNAL", "Unexpected server error", 500);
    }
  };
}

export const RANGE_PRESETS = { "1h": 3_600_000, "6h": 6 * 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 } as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

export const RangeQuery = z.object({
  range: z.enum(["1h", "6h", "24h", "7d", "30d", "custom"]).default("24h"),
  start: z.iso.datetime({ offset: true }).optional(),
  end: z.iso.datetime({ offset: true }).optional(),
});

export function resolveRange(q: { range?: string; start?: string; end?: string }): { start: Date; end: Date; preset: string } {
  if (q.range === "custom" || (q.start && q.end)) {
    if (!q.start || !q.end) throw new RangeError("Custom range requires start and end");
    return { start: new Date(q.start), end: new Date(q.end), preset: "custom" };
  }
  const preset = (q.range && q.range in RANGE_PRESETS ? q.range : "24h") as RangePreset;
  const end = new Date();
  return { start: new Date(end.getTime() - RANGE_PRESETS[preset]), end, preset };
}

export const idList = z
  .string()
  .max(2000)
  .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.string().max(200)).max(12));
