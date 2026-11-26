import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getMetric } from "./metrics/registry";
import { PROVIDER_META, type ProviderType } from "./integrations/contracts";
import { getState, setState } from "./cache";
import type { UnifiedSnapshot } from "./service";

/**
 * Alerting without a database:
 *  - Rules live in `config/alert-rules.json` (version-controllable, editable from the UI
 *    when the filesystem is writable — i.e. local / self-hosted deployments).
 *  - Active alerts are derived by evaluating rules against the current unified snapshot.
 *  - Active/resolved state is kept in server memory so an unresolved condition produces
 *    exactly one alert (duplicate suppression) and resolved alerts appear in a bounded
 *    history. That history resets when the server restarts — documented limitation.
 */

export const AlertRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,64}$/),
    name: z.string().min(1).max(120),
    enabled: z.boolean().default(true),
    severity: z.enum(["info", "warning", "critical"]),
    type: z.enum(["threshold_above", "threshold_below", "station_stale", "integration_failure"]),
    metricKey: z.string().max(120).optional(),
    provider: z.enum(["OBSCAPE", "LICOR", "ECOWITT"]).optional(),
    stationId: z.string().max(200).optional(),
    threshold: z.number().finite().optional(),
    staleMinutes: z.number().int().min(5).max(10080).optional(),
  })
  .superRefine((r, ctx) => {
    if ((r.type === "threshold_above" || r.type === "threshold_below") && (r.metricKey === undefined || r.threshold === undefined)) {
      ctx.addIssue({ code: "custom", message: "Threshold rules need metricKey and threshold" });
    }
    if (r.type === "station_stale" && r.staleMinutes === undefined) ctx.addIssue({ code: "custom", message: "Stale rules need staleMinutes" });
  });
export type AlertRule = z.infer<typeof AlertRuleSchema>;

const RULES_PATH = path.join(process.cwd(), "config", "alert-rules.json");

export async function loadRules(): Promise<{ rules: AlertRule[]; error?: string }> {
  try {
    const text = await fs.readFile(RULES_PATH, "utf8");
    const parsed = z.array(AlertRuleSchema).safeParse(JSON.parse(text));
    if (!parsed.success) return { rules: [], error: "config/alert-rules.json is invalid: " + parsed.error.issues[0]?.message };
    return { rules: parsed.data };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { rules: [] };
    return { rules: [], error: (e as Error).message };
  }
}

export async function saveRules(rules: AlertRule[]) {
  const unique = new Set(rules.map((r) => r.id));
  if (unique.size !== rules.length) throw new Error("Duplicate rule id");
  await fs.mkdir(path.dirname(RULES_PATH), { recursive: true });
  const tmp = RULES_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(rules, null, 2) + "\n", "utf8");
  await fs.rename(tmp, RULES_PATH);
}

export interface AlertEvent {
  key: string;
  ruleId: string;
  ruleName: string;
  severity: AlertRule["severity"];
  type: AlertRule["type"];
  provider: ProviderType | null;
  stationId: string | null;
  stationName: string | null;
  message: string;
  value: number | null;
  unit: string | null;
  observedAt: string | null;
  firstDetectedAt: string;
  lastEvaluatedAt: string;
  resolvedAt: string | null;
  status: "active" | "resolved";
}

interface Condition {
  key: string;
  rule: AlertRule;
  provider: ProviderType | null;
  stationId: string | null;
  stationName: string | null;
  message: string;
  value: number | null;
  unit: string | null;
  observedAt: string | null;
}

/** Pure evaluation: which conditions currently hold. */
export function evaluateRules(rules: AlertRule[], snap: UnifiedSnapshot, now = Date.now()): Condition[] {
  const out: Condition[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const stations = snap.stations.filter((s) => (!rule.provider || s.station.provider === rule.provider) && (!rule.stationId || s.station.id === rule.stationId));
    if (rule.type === "threshold_above" || rule.type === "threshold_below") {
      const metric = getMetric(rule.metricKey!);
      for (const s of stations) {
        for (const o of s.latest.filter((x) => x.metricKey === rule.metricKey)) {
          const hit = rule.type === "threshold_above" ? o.value > rule.threshold! : o.value < rule.threshold!;
          if (!hit) continue;
          out.push({
            key: `${rule.id}|${o.seriesId}`,
            rule,
            provider: s.station.provider,
            stationId: s.station.id,
            stationName: s.station.name,
            message: `${metric.label} ${o.value.toFixed(metric.decimals)} ${o.unit} is ${rule.type === "threshold_above" ? "above" : "below"} ${rule.threshold} ${o.unit}`,
            value: o.value,
            unit: o.unit,
            observedAt: o.observedAt,
          });
        }
      }
    } else if (rule.type === "station_stale") {
      for (const s of stations) {
        const age = s.station.lastSeenAt ? (now - Date.parse(s.station.lastSeenAt)) / 60_000 : Infinity;
        if (age > rule.staleMinutes!) {
          out.push({
            key: `${rule.id}|${s.station.id}`,
            rule,
            provider: s.station.provider,
            stationId: s.station.id,
            stationName: s.station.name,
            message: s.station.lastSeenAt ? `No observation for ${Math.round(age)} min (limit ${rule.staleMinutes} min)` : "Station has not reported any observation",
            value: Number.isFinite(age) ? Math.round(age) : null,
            unit: "min",
            observedAt: s.station.lastSeenAt ?? null,
          });
        }
      }
    } else if (rule.type === "integration_failure") {
      for (const p of snap.providers.filter((x) => !rule.provider || x.provider === rule.provider)) {
        if (!p.configured || !p.errors.length) continue;
        out.push({
          key: `${rule.id}|${p.provider}`,
          rule,
          provider: p.provider,
          stationId: null,
          stationName: null,
          message: `${PROVIDER_META[p.provider].name}: ${p.errors[0].label} — ${p.errors[0].message.slice(0, 160)}`,
          value: p.errors.length,
          unit: "errors",
          observedAt: p.fetchedAt,
        });
      }
    }
  }
  return out;
}

const HISTORY_LIMIT = 200;

/** Reconcile current conditions with in-memory alert state (dedup + resolution). */
export function reconcile(conditions: Condition[], nowIso = new Date().toISOString()) {
  const active = getState<Map<string, AlertEvent>>("alerts:active") ?? new Map<string, AlertEvent>();
  const history = getState<AlertEvent[]>("alerts:history") ?? [];
  const seen = new Set<string>();
  for (const c of conditions) {
    seen.add(c.key);
    const prev = active.get(c.key);
    active.set(c.key, {
      key: c.key,
      ruleId: c.rule.id,
      ruleName: c.rule.name,
      severity: c.rule.severity,
      type: c.rule.type,
      provider: c.provider,
      stationId: c.stationId,
      stationName: c.stationName,
      message: c.message,
      value: c.value,
      unit: c.unit,
      observedAt: c.observedAt,
      firstDetectedAt: prev?.firstDetectedAt ?? nowIso,
      lastEvaluatedAt: nowIso,
      resolvedAt: null,
      status: "active",
    });
  }
  for (const [k, ev] of active) {
    if (!seen.has(k)) {
      active.delete(k);
      history.unshift({ ...ev, status: "resolved", resolvedAt: nowIso });
    }
  }
  history.splice(HISTORY_LIMIT);
  setState("alerts:active", active);
  setState("alerts:history", history);
  const order = { critical: 0, warning: 1, info: 2 };
  return {
    active: [...active.values()].sort((a, b) => order[a.severity] - order[b.severity] || (a.firstDetectedAt < b.firstDetectedAt ? 1 : -1)),
    history,
  };
}

export async function getAlerts(snap: UnifiedSnapshot) {
  const { rules, error } = await loadRules();
  const { active, history } = reconcile(evaluateRules(rules, snap));
  return { rules, rulesError: error, active, history };
}
