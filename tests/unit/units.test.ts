import { describe, expect, it } from "vitest";
import { resolveUnit, toCanonical } from "@/lib/metrics/units";

describe("unit normalization", () => {
  it("converts Fahrenheit to Celsius (all provider spellings)", () => {
    for (const u of ["°F", "ºF", "℉", "F", "degF"]) expect(toCanonical(212, u).value).toBeCloseTo(100, 6);
    expect(toCanonical(32, "ºF")).toMatchObject({ value: 0, unit: "°C", converted: true });
  });
  it("converts speeds to m/s", () => {
    expect(toCanonical(10, "mph").value).toBeCloseTo(4.4704, 6);
    expect(toCanonical(36, "km/h").value).toBeCloseTo(10, 6);
    expect(toCanonical(1, "knots").value).toBeCloseTo(0.514444, 5);
  });
  it("converts precipitation and pressure", () => {
    expect(toCanonical(1, "in").value).toBeCloseTo(25.4, 6);
    expect(toCanonical(1, "in/hr")).toMatchObject({ unit: "mm/h" });
    expect(toCanonical(29.92, "inHg").value).toBeCloseTo(1013.21, 1);
    expect(toCanonical(1013, "mbar")).toMatchObject({ value: 1013, unit: "hPa" }); // 1 mbar ≡ 1 hPa
  });
  it("keeps canonical units unchanged", () => {
    expect(toCanonical(21.5, "°C")).toEqual({ value: 21.5, unit: "°C", converted: false });
  });
  it("flags unknown units and dimension mismatches instead of guessing", () => {
    expect(toCanonical(5, "furlongs").flag).toBe("unknown_unit");
    expect(toCanonical(5, "mph", "temperature")).toMatchObject({ value: 5, flag: "unit_dimension_mismatch" });
  });
  it("resolves klux to lux", () => {
    expect(resolveUnit("klux")!.toCanonical(2)).toBe(2000);
  });
});
