import { describe, expect, it } from "vitest";
import { evaluateRules, reconcile, AlertRuleSchema, type AlertRule } from "@/lib/alerts";
import type { UnifiedSnapshot } from "@/lib/service";

const now = Date.parse("2026-11-13T15:00:00Z");
const snap = (temp: number, lastSeen: string, providerErrors = 0): UnifiedSnapshot => ({
  fetchedAt: "2026-11-13T15:00:00Z",
  isDemo: false,
  refreshIntervalSeconds: 120,
  providers: [{ provider: "ECOWITT", configured: true, isDemo: false, capabilities: { discovery: "supported", latest: "supported", history: "supported", notes: [] }, configuredDeviceCount: 1, stations: [], errors: Array.from({ length: providerErrors }, () => ({ provider: "ECOWITT" as const, kind: "RATE_LIMITED" as const, label: "Rate limited", message: "429" })), warnings: [], fetchedAt: "", durationMs: 1, lastSuccessAt: null, stale: false }],
  stations: [
    {
      station: { id: "ecowitt~A", provider: "ECOWITT", externalId: "A", name: "A", lastSeenAt: lastSeen, isDemo: false, metadata: {} },
      sensors: [],
      series: [],
      errors: [],
      freshness: "live",
      ageMinutes: 0,
      latest: [{ provider: "ECOWITT", stationId: "ecowitt~A", seriesId: "ecowitt~A|outdoor.temperature", metricKey: "air_temperature", originalMetricName: "t", value: temp, unit: "°C", observedAt: lastSeen, retrievedAt: lastSeen, origin: "PROVIDER_REALTIME" }],
    },
  ],
});

const rules: AlertRule[] = [
  { id: "hot", name: "Hot", enabled: true, severity: "warning", type: "threshold_above", metricKey: "air_temperature", threshold: 35 },
  { id: "stale", name: "Stale", enabled: true, severity: "warning", type: "station_stale", staleMinutes: 60 },
  { id: "fail", name: "Fail", enabled: true, severity: "critical", type: "integration_failure" },
  { id: "off", name: "Disabled", enabled: false, severity: "info", type: "threshold_below", metricKey: "air_temperature", threshold: 100 },
];

describe("alert evaluation", () => {
  it("evaluates thresholds, staleness and integration failure; ignores disabled rules", () => {
    const c = evaluateRules(rules, snap(36, "2026-11-13T13:00:00Z", 1), now);
    expect(c.map((x) => x.rule.id).sort()).toEqual(["fail", "hot", "stale"]);
    expect(evaluateRules(rules, snap(20, "2026-11-13T14:59:00Z"), now)).toHaveLength(0);
  });
  it("suppresses duplicates and resolves cleared conditions", () => {
    const first = reconcile(evaluateRules(rules, snap(36, "2026-11-13T14:59:00Z"), now), "2026-11-13T15:00:00.000Z");
    const second = reconcile(evaluateRules(rules, snap(37, "2026-11-13T14:59:00Z"), now), "2026-11-13T15:02:00.000Z");
    expect(first.active).toHaveLength(1);
    expect(second.active).toHaveLength(1);
    expect(second.active[0].firstDetectedAt).toBe("2026-11-13T15:00:00.000Z");
    const third = reconcile(evaluateRules(rules, snap(20, "2026-11-13T14:59:00Z"), now), "2026-11-13T15:04:00.000Z");
    expect(third.active).toHaveLength(0);
    expect(third.history[0]).toMatchObject({ ruleId: "hot", status: "resolved", resolvedAt: "2026-11-13T15:04:00.000Z" });
  });
  it("validates rule definitions", () => {
    expect(AlertRuleSchema.safeParse({ id: "x1y", name: "n", severity: "info", type: "threshold_above" }).success).toBe(false);
    expect(AlertRuleSchema.safeParse({ id: "Bad Id", name: "n", severity: "info", type: "integration_failure" }).success).toBe(false);
  });
});
