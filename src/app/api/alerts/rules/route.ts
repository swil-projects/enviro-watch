import { authorizeApi } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";
import { AlertRuleSchema, loadRules, saveRules } from "@/lib/alerts";

/** Create or update a rule (upsert by id). Persists to config/alert-rules.json. */
export async function POST(req: Request) {
  const auth = await authorizeApi();
  if ("response" in auth) return auth.response;
  const parsed = AlertRuleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_RULE", "Invalid alert rule", 400, parsed.error.issues.map((i) => i.message));
  const { rules, error } = await loadRules();
  if (error) return fail("RULES_UNREADABLE", error, 500);
  const next = rules.some((r) => r.id === parsed.data.id) ? rules.map((r) => (r.id === parsed.data.id ? parsed.data : r)) : [...rules, parsed.data];
  try {
    await saveRules(next);
  } catch (e) {
    return fail("RULES_READ_ONLY", `Could not write config/alert-rules.json (${(e as NodeJS.ErrnoException).code ?? "error"}). On read-only/serverless hosts, edit the file in the repository instead.`, 503);
  }
  return ok(parsed.data, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await authorizeApi();
  if ("response" in auth) return auth.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[a-z0-9-]{3,64}$/.test(id)) return fail("INVALID_ID", "Invalid rule id", 400);
  const { rules } = await loadRules();
  if (!rules.some((r) => r.id === id)) return fail("NOT_FOUND", "Rule not found", 404);
  try {
    await saveRules(rules.filter((r) => r.id !== id));
  } catch (e) {
    return fail("RULES_READ_ONLY", `Could not write config/alert-rules.json (${(e as NodeJS.ErrnoException).code ?? "error"})`, 503);
  }
  return ok({ deleted: id });
}
