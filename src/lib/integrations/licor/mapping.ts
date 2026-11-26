import { slugify } from "../../metrics/registry";
import { unitDimension } from "../../metrics/units";

/**
 * LI-COR measurement type (+ data_type statistic) → canonical metric key.
 *
 * `sensor_measurement_type` is free text in the API contract, so matching is
 * keyword-based and conservative. When the logged statistic is a max/min
 * (rather than an average or a sample) the series gets its own key so that
 * maxima are never averaged together with means.
 */
export function licorMetricKey(measurementType: string | null | undefined, dataType: string | null | undefined, unit: string | null | undefined): string {
  const mt = (measurementType ?? "").toLowerCase().trim();
  const stat = (dataType ?? "").toLowerCase();
  const dim = unitDimension(unit);
  let base: string | null = null;

  if (/gust/.test(mt)) base = "wind_gust";
  else if (/wind\s*speed/.test(mt)) base = "wind_speed";
  else if (/wind\s*dir/.test(mt)) base = "wind_direction";
  else if (/dew\s*point/.test(mt)) base = "dew_point";
  else if (/water\s*temp/.test(mt)) base = "water_temperature";
  else if (/soil\s*temp/.test(mt)) base = "soil_temperature";
  else if (/^temp|^air\s*temp|temperature$/.test(mt) && dim === "temperature") base = "air_temperature";
  else if (/\brh\b|relative\s*humidity|^humidity/.test(mt)) base = "relative_humidity";
  else if (/\bpar\b|photosynthetic/.test(mt)) base = "par";
  else if (/solar|irradiance|radiation/.test(mt) && dim === "irradiance") base = "solar_radiation";
  else if (/rain/.test(mt) && dim === "precip_depth") base = "rain_interval";
  else if (/water\s*level/.test(mt) && dim === "water_length") base = "water_level";
  else if (/(barometric|atmospheric|air)?\s*pressure/.test(mt) && dim === "pressure" && !/water/.test(mt)) base = "barometric_pressure";
  else if (/water\s*content|soil\s*moisture|vwc/.test(mt)) base = dim === "vwc" ? "soil_moisture_vwc" : dim === "ratio_percent" ? "soil_moisture_percent" : null;
  else if (/leaf\s*wet/.test(mt)) base = "leaf_wetness";
  else if (/vpd|vapou?r\s*pressure\s*deficit/.test(mt)) base = "vapor_pressure_deficit";
  else if (/batt/.test(mt)) base = dim === "voltage" ? "battery_voltage" : dim === "ratio_percent" ? "battery_percent" : null;

  if (!base) return `licor:${slugify([mt || "measurement", stat].filter(Boolean).join(" "))}`;
  if (/\bmax/.test(stat) && base !== "wind_gust") return `licor:${base}_max`;
  if (/\bmin/.test(stat)) return `licor:${base}_min`;
  if (/\b(std|stdev|standard)/.test(stat)) return `licor:${base}_stddev`;
  return base;
}

/** LI-COR error codes documented in the OpenAPI spec at https://api.licor.cloud/v1/docs/ (verified 2026-11-13). */
export const LICOR_ERROR_CODES: Record<string, string> = {
  "VAL-001": "Invalid parameters",
  "ATH-001": "Invalid token",
  "SYS-001": "System is busy",
  "SYS-002": "Too many requests",
  "DW-010": "Failed to retrieve observations from data warehouse",
};

/** UTC timestamp in the format the API requires: `yyyy-MM-dd HH:mm:ss`. */
export function licorUtc(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
