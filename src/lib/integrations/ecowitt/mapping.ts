import { slugify } from "../../metrics/registry";
import { unitDimension } from "../../metrics/units";

/**
 * Ecowitt field path → canonical metric key.
 * Paths are `<group>.<field>` as returned by /api/v3/device/real_time and /history.
 * Source: https://doc.ecowitt.net/web/#/apiv3en?page_id=17 (verified 2026-11-13).
 *
 * Deliberately conservative: extra temperature/humidity channels (temp_and_humidity_chN,
 * temp_chN) are NOT mapped to outdoor air temperature, because the API does not say
 * where those sensors are installed. They remain provider-specific metrics.
 */
const FIELD_MAP: Record<string, string> = {
  "outdoor.temperature": "air_temperature",
  "outdoor.feels_like": "feels_like_temperature",
  "outdoor.app_temp": "apparent_temperature",
  "outdoor.dew_point": "dew_point",
  "outdoor.humidity": "relative_humidity",
  "outdoor.vpd": "vapor_pressure_deficit",
  "indoor.temperature": "indoor_air_temperature",
  "indoor.humidity": "indoor_relative_humidity",
  "solar_and_uvi.solar": "solar_radiation",
  "solar_and_uvi.uvi": "uv_index",
  "wind.wind_speed": "wind_speed",
  "wind.wind_gust": "wind_gust",
  "wind.wind_direction": "wind_direction",
  "wind.10_minute_average_wind_direction": "wind_direction_10min",
  "pressure.relative": "pressure_sea_level",
  "pressure.absolute": "pressure_station",
  "lightning.distance": "lightning_distance",
  "lightning.count": "lightning_count",
};

const RAIN_FIELDS: Record<string, string> = {
  rain_rate: "rain_rate",
  daily: "rain_daily",
  event: "rain_event",
  hourly: "rain_hourly",
  "1_hour": "rain_hourly",
  "24_hours": "rain_24h",
  weekly: "rain_weekly",
  monthly: "rain_monthly",
  yearly: "rain_yearly",
};

export function ecowittMetricKey(path: string, unit: string | null | undefined): string {
  const direct = FIELD_MAP[path];
  if (direct) {
    // Solar may be requested in lux/fc instead of W/m² — that's a different quantity.
    if (direct === "solar_radiation" && unitDimension(unit) === "illuminance") return "illuminance";
    return direct;
  }
  const [group, ...rest] = path.split(".");
  const field = rest.join(".");
  if ((group === "rainfall" || group === "rainfall_piezo") && RAIN_FIELDS[field]) return RAIN_FIELDS[field];
  if (/^pm25_ch\d+$|^pm25_aqi_combo$/.test(group) && field === "pm25") return "pm25";
  if (group === "pm10_aqi_combo" && field === "pm10") return "pm10";
  if (group === "pm1_aqi_combo" && field === "pm1") return "pm1";
  if (group === "pm4_aqi_combo" && field === "pm4") return "pm4";
  if ((group === "co2_aqi_combo" || group === "indoor_co2") && field === "co2") return "co2";
  if (/^soil_ch\d+$/.test(group) && field === "soilmoisture") return "soil_moisture_percent";
  if (/^leaf_ch\d+$/.test(group) && /leaf_wetness/.test(field)) return "leaf_wetness";
  if (group === "battery") {
    const dim = unitDimension(unit);
    if (dim === "voltage") return "battery_voltage";
    if (dim === "ratio_percent") return "battery_percent";
    return "battery_state";
  }
  return `ecowitt:${slugify(path)}`;
}

/** Friendly label for a series, keeping the provider's context (e.g. piezo gauge, channel). */
export function ecowittSeriesLabel(path: string): string {
  return path
    .split(".")
    .map((p) => p.replace(/_/g, " "))
    .join(" › ");
}

/** Unit-id query params: request metric units so values arrive canonical (originals still preserved). */
export const ECOWITT_UNIT_PARAMS: Record<string, string> = {
  temp_unitid: "1", // °C
  pressure_unitid: "3", // hPa
  wind_speed_unitid: "6", // m/s
  rainfall_unitid: "12", // mm
  solar_irradiance_unitid: "16", // W/m²
  capacity_unitid: "24", // L
};

/** Documented result codes (page_id=9). */
export const ECOWITT_CODES: Record<number, { kind: import("../errors").ProviderErrorKind; text: string }> = {
  [-1]: { kind: "PROVIDER_UNAVAILABLE", text: "System is busy" },
  40000: { kind: "INVALID_REQUEST", text: "Illegal parameter" },
  40010: { kind: "INVALID_CREDENTIALS", text: "Illegal application_key" },
  40011: { kind: "INVALID_CREDENTIALS", text: "Illegal api_key" },
  40012: { kind: "DEVICE_NOT_FOUND", text: "Illegal MAC/IMEI" },
  40013: { kind: "INVALID_REQUEST", text: "Illegal start_date" },
  40014: { kind: "INVALID_REQUEST", text: "Illegal end_date" },
  40015: { kind: "INVALID_REQUEST", text: "Illegal cycle_type" },
  40016: { kind: "INVALID_REQUEST", text: "Illegal call_back" },
  40017: { kind: "MISSING_CREDENTIALS", text: "Missing application_key" },
  40018: { kind: "MISSING_CREDENTIALS", text: "Missing api_key" },
  40019: { kind: "DEVICE_NOT_FOUND", text: "Missing MAC" },
  40020: { kind: "INVALID_REQUEST", text: "Missing start_date" },
  40021: { kind: "INVALID_REQUEST", text: "Missing end_date" },
  40022: { kind: "INVALID_REQUEST", text: "Illegal voucher type" },
  43001: { kind: "UNSUPPORTED", text: "Needs other service support" },
  44001: { kind: "MALFORMED_RESPONSE", text: "Media file or data packet is null" },
  45001: { kind: "RATE_LIMITED", text: "Over the limit or other error" },
  46001: { kind: "INVALID_REQUEST", text: "No existing request" },
  47001: { kind: "MALFORMED_RESPONSE", text: "Parse JSON/XML contents error" },
  48001: { kind: "ACCESS_DENIED", text: "Privilege problem" },
};

/** History resolution rules (page_id=19). */
export interface EcowittCycle {
  cycleType: "5min" | "30min" | "4hour" | "1day";
  label: string;
  /** Maximum span of a single request. */
  maxSpanMs: number;
  /** How far back this resolution is retained. */
  retentionDays: number;
}
const DAY = 86_400_000;
export const ECOWITT_CYCLES: EcowittCycle[] = [
  { cycleType: "5min", label: "5 min", maxSpanMs: DAY, retentionDays: 90 },
  { cycleType: "30min", label: "30 min", maxSpanMs: 7 * DAY, retentionDays: 365 },
  { cycleType: "4hour", label: "4 h", maxSpanMs: 28 * DAY, retentionDays: 730 },
  { cycleType: "1day", label: "1 day", maxSpanMs: 365 * DAY, retentionDays: 1460 },
];

/** Pick the finest resolution that (a) retains data back to `start` and (b) needs a sensible number of requests. */
export function chooseEcowittCycle(start: Date, end: Date, now = new Date(), maxRequests = 8): EcowittCycle | null {
  const ageDays = (now.getTime() - start.getTime()) / DAY;
  const span = end.getTime() - start.getTime();
  for (const c of ECOWITT_CYCLES) {
    if (ageDays > c.retentionDays) continue;
    if (Math.ceil(span / c.maxSpanMs) <= maxRequests) return c;
  }
  return null;
}
