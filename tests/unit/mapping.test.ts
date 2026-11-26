import { describe, expect, it } from "vitest";
import { chooseEcowittCycle, ecowittMetricKey } from "@/lib/integrations/ecowitt/mapping";
import { licorMetricKey, licorUtc } from "@/lib/integrations/licor/mapping";
import { obscapeMetricKey } from "@/lib/integrations/obscape/adapter";

describe("Ecowitt metric mapping", () => {
  it("maps documented fields and keeps different physical meanings apart", () => {
    expect(ecowittMetricKey("outdoor.temperature", "ºF")).toBe("air_temperature");
    expect(ecowittMetricKey("indoor.temperature", "ºF")).toBe("indoor_air_temperature");
    expect(ecowittMetricKey("pressure.relative", "inHg")).toBe("pressure_sea_level");
    expect(ecowittMetricKey("pressure.absolute", "inHg")).toBe("pressure_station");
    expect(ecowittMetricKey("rainfall.rain_rate", "in/hr")).toBe("rain_rate");
    expect(ecowittMetricKey("rainfall.daily", "in")).toBe("rain_daily");
    expect(ecowittMetricKey("rainfall_piezo.1_hour", "in")).toBe("rain_hourly");
    expect(ecowittMetricKey("solar_and_uvi.solar", "lux")).toBe("illuminance");
  });
  it("does not treat extra channels as outdoor air temperature", () => {
    expect(ecowittMetricKey("temp_and_humidity_ch1.temperature", "ºF")).toMatch(/^ecowitt:/);
  });
  it("maps battery readings by unit", () => {
    expect(ecowittMetricKey("battery.wind_sensor", "V")).toBe("battery_voltage");
    expect(ecowittMetricKey("battery.sensor_array", "")).toBe("battery_state");
  });
  it("chooses history resolution within documented retention / span limits", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    const d = (days: number) => new Date(now.getTime() - days * 86_400_000);
    expect(chooseEcowittCycle(d(1), now, now)!.cycleType).toBe("5min");
    expect(chooseEcowittCycle(d(7), now, now)!.cycleType).toBe("5min");
    expect(chooseEcowittCycle(d(30), now, now)!.cycleType).toBe("30min");
    expect(chooseEcowittCycle(d(200), d(190), now)!.cycleType).toBe("30min");
    expect(chooseEcowittCycle(d(120), d(119), now)!.cycleType).toBe("30min"); // beyond 90-day 5-min retention
    expect(chooseEcowittCycle(d(2000), d(1990), now)).toBeNull();
  });
});

describe("LI-COR metric mapping", () => {
  it("maps measurement types and separates max/min statistics", () => {
    expect(licorMetricKey("Temperature", "Avg", "°C")).toBe("air_temperature");
    expect(licorMetricKey("RH", "Avg", "%")).toBe("relative_humidity");
    expect(licorMetricKey("Rain", "Sum", "mm")).toBe("rain_interval");
    expect(licorMetricKey("Wind Speed", "Avg", "m/s")).toBe("wind_speed");
    expect(licorMetricKey("Wind Speed", "Max", "m/s")).toBe("licor:wind_speed_max");
    expect(licorMetricKey("Gust Speed", "Max", "m/s")).toBe("wind_gust");
    expect(licorMetricKey("Water Content", "Sample", "m³/m³")).toBe("soil_moisture_vwc");
    expect(licorMetricKey("Mystery", "Avg", "")).toBe("licor:mystery_avg");
  });
  it("formats UTC request timestamps as yyyy-MM-dd HH:mm:ss", () => {
    expect(licorUtc(new Date("2026-11-10T05:07:09.123Z"))).toBe("2026-11-10 05:07:09");
  });
});

describe("Obscape parameter mapping (verified captions)", () => {
  it("maps wave and water parameters, keeping distinct period definitions apart", () => {
    expect(obscapeMetricKey("Hm0")).toBe("wave_height_significant");
    expect(obscapeMetricKey("level")).toBe("water_level");
    expect(obscapeMetricKey("Tm01")).toBe("wave_period_tm01");
    expect(obscapeMetricKey("Tm02")).toBe("wave_period_tm02");
    expect(obscapeMetricKey("PATM")).toBe("barometric_pressure");
  });
  it("does not treat the logger's internal temperature/humidity as ambient air", () => {
    expect(obscapeMetricKey("TEMP")).toBe("obscape:temp");
    expect(obscapeMetricKey("HUM")).toBe("obscape:hum");
  });
});
