import { describe, expect, it } from "vitest";
import { dedupeObservations, normalizeReading, parseNumeric, parseTimestamp } from "@/lib/normalize";
import type { UnifiedObservation, UnifiedSeries } from "@/lib/integrations/contracts";

const series: UnifiedSeries = { id: "s|t", stationId: "s", metricKey: "air_temperature", sourceKey: "t", originalMetricName: "t", unit: "°C", originalUnit: "°F" };

describe("parseNumeric", () => {
  it("never turns missing values into zero", () => {
    for (const v of [null, undefined, "", " ", "-", "--", "N/A", "null", "NaN", {}]) expect(parseNumeric(v)).toBeNull();
  });
  it("parses numeric strings", () => {
    expect(parseNumeric("84.2")).toBe(84.2);
    expect(parseNumeric("1,013.2")).toBe(1013.2);
    expect(parseNumeric(0)).toBe(0);
  });
});

describe("parseTimestamp", () => {
  it("handles unix seconds and milliseconds", () => {
    expect(parseTimestamp("1794579700")!.toISOString()).toBe("2026-11-13T14:21:40.000Z");
    expect(parseTimestamp(1794579700000)!.toISOString()).toBe("2026-11-13T14:21:40.000Z");
  });
  it("treats zone-less 'yyyy-MM-dd HH:mm:ss' as UTC and honours offsets", () => {
    expect(parseTimestamp("2026-11-13 12:00:00")!.toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(parseTimestamp("2026-11-13 12:00:00Z")!.toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(parseTimestamp("2026-11-13T07:00:00-05:00")!.toISOString()).toBe("2026-11-13T12:00:00.000Z");
  });
  it("rejects malformed and implausible timestamps", () => {
    for (const v of ["not-a-date", "", null, 0, "1999-01-01 00:00:00", new Date(Date.now() + 3 * 86_400_000).toISOString()]) expect(parseTimestamp(v)).toBeNull();
  });
});

describe("normalizeReading", () => {
  const base = { provider: "ECOWITT" as const, series, origin: "PROVIDER_REALTIME" as const, retrievedAt: "2026-11-13T15:00:00.000Z" };
  it("converts and preserves the original value/unit", () => {
    const r = normalizeReading({ ...base, rawValue: "84.2", rawUnit: "ºF", rawTime: "1794579700" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.observation.value).toBeCloseTo(29, 6);
      expect(r.observation).toMatchObject({ unit: "°C", originalValue: "84.2", originalUnit: "ºF", observedAt: "2026-11-13T14:21:40.000Z", qualityFlag: null });
    }
  });
  it("rejects missing values and bad timestamps", () => {
    expect(normalizeReading({ ...base, rawValue: "", rawUnit: "ºF", rawTime: "1794579700" })).toEqual({ ok: false, reason: "missing_value" });
    expect(normalizeReading({ ...base, rawValue: "1", rawUnit: "ºF", rawTime: "garbage" })).toEqual({ ok: false, reason: "invalid_timestamp" });
  });
  it("flags missing units and implausible values without dropping them", () => {
    const a = normalizeReading({ ...base, rawValue: "20", rawUnit: "", rawTime: "1794579700" });
    expect(a.ok && a.observation.qualityFlag).toBe("missing_unit");
    const b = normalizeReading({ ...base, rawValue: "300", rawUnit: "°C", rawTime: "1794579700" });
    expect(b.ok && b.observation.qualityFlag).toBe("out_of_plausible_range");
  });
});

describe("dedupeObservations", () => {
  const o = (at: string, origin: UnifiedObservation["origin"], value: number): UnifiedObservation => ({ provider: "ECOWITT", stationId: "s", seriesId: "s|t", metricKey: "air_temperature", originalMetricName: "t", value, unit: "°C", observedAt: at, retrievedAt: at, origin });
  it("removes duplicates, prefers provider history, and sorts out-of-order input", () => {
    const out = dedupeObservations([o("2026-11-13T12:10:00.000Z", "PROVIDER_REALTIME", 1), o("2026-11-13T12:00:00.000Z", "PROVIDER_HISTORY", 2), o("2026-11-13T12:10:00.000Z", "PROVIDER_HISTORY", 3), o("2026-11-13T12:00:00.000Z", "PROVIDER_HISTORY", 2)]);
    expect(out.map((x) => x.value)).toEqual([2, 3]);
  });
});
