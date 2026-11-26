import { describe, expect, it } from "vitest";
import { bucketize, computeInsights, prepareObservations, chooseBucketMs, circularMean, computeStats, findGaps, median, periodChange } from "@/lib/analytics";
import { getMetric } from "@/lib/metrics/registry";
import type { UnifiedObservation } from "@/lib/integrations/contracts";

const T0 = Date.UTC(2026, 10, 13, 0, 0, 0);
const obs = (mins: number, value: number, metricKey = "air_temperature"): UnifiedObservation => ({
  provider: "LICOR", stationId: "s", seriesId: "s|x", metricKey, originalMetricName: "x", value, unit: "", observedAt: new Date(T0 + mins * 60_000).toISOString(), retrievedAt: "", origin: "PROVIDER_HISTORY",
});

describe("statistics", () => {
  it("computes min/max/mean/median", () => {
    const s = computeStats([obs(0, 1), obs(10, 2), obs(20, 3), obs(30, 10)], getMetric("air_temperature"));
    expect(s).toMatchObject({ count: 4, min: 1, max: 10, mean: 4, median: 2.5, total: null });
  });
  it("uses circular mean for directions (350° and 10° average to 0°, not 180°)", () => {
    expect(circularMean([350, 10])! % 360).toBeCloseTo(0, 6);
    const s = computeStats([obs(0, 350, "wind_direction"), obs(10, 10, "wind_direction")], getMetric("wind_direction"));
    expect(Math.min(s.mean!, 360 - s.mean!)).toBeCloseTo(0, 6);
    expect(s.min).toBeNull();
  });
  it("never averages running totals; sums interval totals", () => {
    expect(computeStats([obs(0, 1, "rain_daily"), obs(10, 2, "rain_daily")], getMetric("rain_daily")).mean).toBeNull();
    expect(computeStats([obs(0, 0.2, "rain_interval"), obs(15, 0.4, "rain_interval")], getMetric("rain_interval")).total).toBeCloseTo(0.6);
  });
  it("median of empty is null", () => expect(median([])).toBeNull());
});

describe("bucketize", () => {
  it("emits null for empty buckets (gaps), never zero", () => {
    const b = bucketize([obs(0, 1), obs(5, 3), obs(125, 7)], 60 * 60_000, T0, T0 + 3 * 3_600_000, getMetric("air_temperature"));
    expect(b.map((x) => x.value)).toEqual([2, null, 7]);
  });
  it("sums interval totals and takes the last value of running totals", () => {
    const sum = bucketize([obs(0, 0.2, "rain_interval"), obs(15, 0.3, "rain_interval")], 3_600_000, T0, T0 + 3_600_000, getMetric("rain_interval"));
    expect(sum[0].value).toBeCloseTo(0.5);
    const last = bucketize([obs(0, 1, "rain_daily"), obs(50, 4, "rain_daily"), obs(20, 2, "rain_daily")], 3_600_000, T0, T0 + 3_600_000, getMetric("rain_daily"));
    expect(last[0].value).toBe(4);
  });
  it("picks bucket sizes bounded by maxPoints", () => {
    expect(chooseBucketMs(86_400_000, 400)).toBe(300_000);
    expect(30 * 86_400_000 / chooseBucketMs(30 * 86_400_000, 400)).toBeLessThanOrEqual(400);
  });
});

describe("gaps & completeness", () => {
  it("detects a gap longer than 2.5× the typical interval", () => {
    const series = [0, 10, 20, 30, 40, 100, 110, 120].map((m) => obs(m, 1));
    const r = findGaps(series, T0, T0 + 120 * 60_000);
    expect(r.intervalMs).toBe(600_000);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].durationMinutes).toBe(60);
    expect(r.completeness).toBeCloseTo(8 / 12);
  });
});

describe("periodChange", () => {
  it("compares means for instantaneous metrics and refuses counters", () => {
    const m = getMetric("air_temperature");
    const a = computeStats([obs(0, 30)], m);
    const b = computeStats([obs(0, 28)], m);
    expect(periodChange(a, b, "air_temperature")).toMatchObject({ delta: 2, basis: "mean" });
    expect(periodChange(a, b, "rain_daily")).toBeNull();
  });
});

describe("production history preparation", () => {
  it("sorts, filters rounded-cache spillover and invalid readings, and excludes the end boundary", () => {
    const rows = [obs(20, 3), obs(-1, 99), obs(10, 2), obs(30, 99), obs(15, NaN), { ...obs(0, 1), observedAt: "invalid" }];
    expect(prepareObservations(rows, T0, T0 + 30 * 60_000).map((o) => o.value)).toEqual([2, 3]);
  });
  it("deduplicates timestamps within a series using the newest retrieval, preserving separate sensors", () => {
    const rows = [{ ...obs(10, 1), retrievedAt: "2026-11-13T01:00:00Z" }, { ...obs(10, 2), retrievedAt: "2026-11-13T02:00:00Z" }, { ...obs(10, 3), seriesId: "s|other" }];
    expect(prepareObservations(rows, T0, T0 + 60 * 60_000).map((o) => o.value)).toEqual([2, 3]);
  });
  it("does not double count shared period boundaries", () => {
    const rows = [obs(0, 1), obs(10, 2), obs(20, 3)];
    const a = prepareObservations(rows, T0, T0 + 10 * 60_000);
    const b = prepareObservations(rows, T0 + 10 * 60_000, T0 + 20 * 60_000);
    expect(a.map((o) => o.value)).toEqual([1]);
    expect(b.map((o) => o.value)).toEqual([2]);
  });
  it("excludes end spillover from a partial aggregation bucket", () => {
    const buckets = bucketize([obs(1, 2), obs(7, 99)], 10 * 60_000, T0, T0 + 5 * 60_000, getMetric("air_temperature"));
    expect(buckets[0].value).toBe(2);
  });
});

describe("series insights", () => {
  it("computes interpolated percentiles, sample variability and a time-based linear fit", () => {
    const result = computeInsights([obs(0, 1), obs(60, 3), obs(120, 5)], getMetric("air_temperature"));
    expect(result.p10).toBeCloseTo(1.4);
    expect(result.p90).toBeCloseTo(4.6);
    expect(result.standardDeviation).toBe(2);
    expect(result.trend?.perHour).toBeCloseTo(2);
    expect(result.trend?.rSquared).toBeCloseTo(1);
  });
  it("handles constant data, sparse data and invalid values without fabricating a fit", () => {
    expect(computeInsights([], getMetric("air_temperature")).trend).toBeNull();
    const constant = computeInsights([obs(0, 2), obs(60, 2), obs(120, 2), obs(180, Infinity)], getMetric("air_temperature"));
    expect(constant.trend).toEqual({ perHour: 0, rSquared: 0 });
    expect(constant.standardDeviation).toBe(0);
  });
  it("counts quality flags and IQR outliers without treating them as threshold alerts", () => {
    const rows = [1, 2, 2, 2, 3, 3, 3, 100].map((v, i) => obs(i * 10, v));
    rows[7].qualityFlag = "suspect";
    const result = computeInsights(rows, getMetric("air_temperature"));
    expect(result.outlierCount).toBe(1);
    expect(result.flaggedCount).toBe(1);
  });
  it.each(["wind_direction", "rain_daily", "rain_interval", "battery_state"])("does not apply scalar regression or percentiles to %s", (key) => {
    const result = computeInsights([obs(0, 350), obs(60, 10), obs(120, 20)], getMetric(key));
    expect(result.trend).toBeNull();
    expect(result.p10).toBeNull();
    expect(result.latest).toBe(20);
  });
});
