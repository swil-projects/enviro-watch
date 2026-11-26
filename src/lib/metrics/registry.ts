import type { Dimension } from "./units";

/**
 * Canonical metric definitions.
 *
 * `kind` drives which aggregations are scientifically valid:
 *   instantaneous  – point sample (temperature, humidity). Bucket = mean/min/max.
 *   interval_total – amount accumulated during the logging interval (LI-COR rain). Bucket = sum.
 *   running_total  – counter that grows and periodically resets (Ecowitt daily rain). Bucket = last; never averaged or summed.
 *   rate           – instantaneous rate (rain rate). Bucket = mean/max.
 *   direction      – angle in degrees. Bucket = circular mean; never arithmetic mean.
 *   state          – coded status (battery level codes). Bucket = last.
 *
 * Two series are comparable only when they share a metricKey. Metrics that look
 * similar but differ physically get different keys (wave vs wind direction,
 * rain rate vs accumulated rain, relative vs absolute pressure).
 */
export type MetricKind = "instantaneous" | "interval_total" | "running_total" | "rate" | "direction" | "state";
export type MetricCategory =
  | "temperature"
  | "humidity"
  | "wind"
  | "pressure"
  | "precipitation"
  | "radiation"
  | "marine"
  | "soil"
  | "air_quality"
  | "lightning"
  | "device"
  | "other";

export interface MetricDefinition {
  key: string;
  label: string;
  shortLabel?: string;
  category: MetricCategory;
  dimension: Dimension;
  kind: MetricKind;
  /** Show on overview "headline" cards, in order. */
  headline?: number;
  decimals: number;
  description?: string;
  /** Physically plausible range in canonical units; values outside are flagged as suspect (not dropped). */
  plausible?: [number, number];
}

const defs: MetricDefinition[] = [
  { key: "air_temperature", label: "Air temperature", shortLabel: "Temperature", category: "temperature", dimension: "temperature", kind: "instantaneous", headline: 1, decimals: 1, plausible: [-60, 60] },
  { key: "indoor_air_temperature", label: "Indoor temperature", category: "temperature", dimension: "temperature", kind: "instantaneous", decimals: 1, plausible: [-20, 60] },
  { key: "feels_like_temperature", label: "Feels-like temperature", category: "temperature", dimension: "temperature", kind: "instantaneous", decimals: 1 },
  { key: "apparent_temperature", label: "Apparent temperature", category: "temperature", dimension: "temperature", kind: "instantaneous", decimals: 1 },
  { key: "dew_point", label: "Dew point", category: "temperature", dimension: "temperature", kind: "instantaneous", decimals: 1, plausible: [-60, 40] },
  { key: "water_temperature", label: "Water temperature", category: "marine", dimension: "temperature", kind: "instantaneous", headline: 10, decimals: 1, plausible: [-3, 40] },
  { key: "soil_temperature", label: "Soil temperature", category: "soil", dimension: "temperature", kind: "instantaneous", decimals: 1 },

  { key: "relative_humidity", label: "Relative humidity", shortLabel: "Humidity", category: "humidity", dimension: "ratio_percent", kind: "instantaneous", headline: 2, decimals: 0, plausible: [0, 100] },
  { key: "indoor_relative_humidity", label: "Indoor humidity", category: "humidity", dimension: "ratio_percent", kind: "instantaneous", decimals: 0, plausible: [0, 100] },
  { key: "vapor_pressure_deficit", label: "Vapour pressure deficit", category: "humidity", dimension: "pressure", kind: "instantaneous", decimals: 2 },

  { key: "wind_speed", label: "Wind speed", category: "wind", dimension: "speed", kind: "instantaneous", headline: 3, decimals: 1, plausible: [0, 90] },
  { key: "wind_gust", label: "Wind gust", category: "wind", dimension: "speed", kind: "instantaneous", headline: 4, decimals: 1, plausible: [0, 120] },
  { key: "wind_direction", label: "Wind direction", category: "wind", dimension: "angle", kind: "direction", headline: 5, decimals: 0, plausible: [0, 360] },
  { key: "wind_direction_10min", label: "Wind direction (10-min avg)", category: "wind", dimension: "angle", kind: "direction", decimals: 0, plausible: [0, 360] },

  { key: "pressure_sea_level", label: "Pressure (relative / sea-level)", shortLabel: "Pressure", category: "pressure", dimension: "pressure", kind: "instantaneous", headline: 6, decimals: 1, plausible: [850, 1090] },
  { key: "pressure_station", label: "Pressure (absolute / station)", category: "pressure", dimension: "pressure", kind: "instantaneous", decimals: 1, plausible: [500, 1090] },
  { key: "barometric_pressure", label: "Barometric pressure (unspecified reference)", category: "pressure", dimension: "pressure", kind: "instantaneous", decimals: 1, plausible: [500, 1090] },

  { key: "rain_rate", label: "Rain rate", category: "precipitation", dimension: "precip_rate", kind: "rate", decimals: 1, plausible: [0, 500] },
  { key: "rain_interval", label: "Rainfall (per logging interval)", shortLabel: "Rainfall", category: "precipitation", dimension: "precip_depth", kind: "interval_total", headline: 7, decimals: 1 },
  { key: "rain_event", label: "Rainfall (event total)", category: "precipitation", dimension: "precip_depth", kind: "running_total", decimals: 1 },
  { key: "rain_hourly", label: "Rainfall (hourly total)", category: "precipitation", dimension: "precip_depth", kind: "running_total", decimals: 1 },
  { key: "rain_daily", label: "Rainfall (today)", shortLabel: "Rain today", category: "precipitation", dimension: "precip_depth", kind: "running_total", headline: 8, decimals: 1 },
  { key: "rain_24h", label: "Rainfall (last 24 h)", category: "precipitation", dimension: "precip_depth", kind: "running_total", decimals: 1 },
  { key: "rain_weekly", label: "Rainfall (this week)", category: "precipitation", dimension: "precip_depth", kind: "running_total", decimals: 1 },
  { key: "rain_monthly", label: "Rainfall (this month)", category: "precipitation", dimension: "precip_depth", kind: "running_total", decimals: 1 },
  { key: "rain_yearly", label: "Rainfall (this year)", category: "precipitation", dimension: "precip_depth", kind: "running_total", decimals: 1 },

  { key: "solar_radiation", label: "Solar radiation", category: "radiation", dimension: "irradiance", kind: "instantaneous", headline: 9, decimals: 0, plausible: [0, 1600] },
  { key: "illuminance", label: "Illuminance", category: "radiation", dimension: "illuminance", kind: "instantaneous", decimals: 0 },
  { key: "uv_index", label: "UV index", category: "radiation", dimension: "dimensionless", kind: "instantaneous", decimals: 0, plausible: [0, 20] },
  { key: "par", label: "Photosynthetically active radiation", shortLabel: "PAR", category: "radiation", dimension: "par", kind: "instantaneous", decimals: 0 },

  { key: "water_level", label: "Water level", category: "marine", dimension: "water_length", kind: "instantaneous", headline: 11, decimals: 3 },
  { key: "wave_height_significant", label: "Significant wave height (Hm0)", shortLabel: "Wave height", category: "marine", dimension: "water_length", kind: "instantaneous", headline: 12, decimals: 2, plausible: [0, 30] },
  { key: "wave_height_max", label: "Maximum wave height", category: "marine", dimension: "water_length", kind: "instantaneous", decimals: 2, plausible: [0, 40] },
  { key: "wave_period_peak", label: "Peak wave period (Tp)", category: "marine", dimension: "time", kind: "instantaneous", decimals: 1, plausible: [0, 30] },
  { key: "wave_period_tm01", label: "Mean wave period (Tm01)", category: "marine", dimension: "time", kind: "instantaneous", decimals: 1, plausible: [0, 30] },
  { key: "wave_period_tm02", label: "Mean wave period (Tm02)", category: "marine", dimension: "time", kind: "instantaneous", decimals: 1, plausible: [0, 30] },
  { key: "swell_height", label: "Swell wave height", category: "marine", dimension: "water_length", kind: "instantaneous", decimals: 2, plausible: [0, 30] },
  { key: "swell_period", label: "Swell wave period", category: "marine", dimension: "time", kind: "instantaneous", decimals: 1, plausible: [0, 40] },
  { key: "water_depth", label: "Water depth", category: "marine", dimension: "water_length", kind: "instantaneous", decimals: 2 },
  { key: "wave_direction", label: "Wave direction", category: "marine", dimension: "angle", kind: "direction", decimals: 0, plausible: [0, 360] },

  { key: "soil_moisture_vwc", label: "Soil volumetric water content", category: "soil", dimension: "vwc", kind: "instantaneous", decimals: 3 },
  { key: "soil_moisture_percent", label: "Soil moisture", category: "soil", dimension: "ratio_percent", kind: "instantaneous", decimals: 0, plausible: [0, 100] },
  { key: "soil_conductivity", label: "Soil electrical conductivity", category: "soil", dimension: "conductivity", kind: "instantaneous", decimals: 2 },
  { key: "leaf_wetness", label: "Leaf wetness", category: "soil", dimension: "ratio_percent", kind: "instantaneous", decimals: 0 },

  { key: "pm1", label: "PM1", category: "air_quality", dimension: "concentration_mass", kind: "instantaneous", decimals: 0 },
  { key: "pm25", label: "PM2.5", category: "air_quality", dimension: "concentration_mass", kind: "instantaneous", decimals: 0 },
  { key: "pm4", label: "PM4", category: "air_quality", dimension: "concentration_mass", kind: "instantaneous", decimals: 0 },
  { key: "pm10", label: "PM10", category: "air_quality", dimension: "concentration_mass", kind: "instantaneous", decimals: 0 },
  { key: "co2", label: "CO₂", category: "air_quality", dimension: "concentration_ppm", kind: "instantaneous", decimals: 0 },

  { key: "lightning_distance", label: "Lightning distance", category: "lightning", dimension: "distance", kind: "instantaneous", decimals: 0 },
  { key: "lightning_count", label: "Lightning strikes (counter)", category: "lightning", dimension: "dimensionless", kind: "running_total", decimals: 0 },

  { key: "solar_panel_voltage", label: "Solar panel voltage", category: "device", dimension: "voltage", kind: "instantaneous", decimals: 2 },
  { key: "battery_voltage", label: "Battery voltage", category: "device", dimension: "voltage", kind: "instantaneous", decimals: 2, plausible: [0, 30] },
  { key: "battery_percent", label: "Battery level", category: "device", dimension: "ratio_percent", kind: "instantaneous", decimals: 0, plausible: [0, 100] },
  { key: "battery_state", label: "Battery state (provider code)", category: "device", dimension: "dimensionless", kind: "state", decimals: 0 },
];

export const METRICS: Record<string, MetricDefinition> = Object.fromEntries(defs.map((d) => [d.key, d]));

/** Definition for metrics we don't recognise — they are still shown, but never merged across providers. */
export function getMetric(key: string, fallbackLabel?: string, fallbackDimension: Dimension = "dimensionless"): MetricDefinition {
  return (
    METRICS[key] ?? {
      key,
      label: fallbackLabel ?? humanize(key.split(":").pop() ?? key),
      category: "other",
      dimension: fallbackDimension,
      kind: "instantaneous",
      decimals: 2,
    }
  );
}

export function isKnownMetric(key: string) {
  return key in METRICS;
}

export function humanize(s: string) {
  const t = s.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const CATEGORY_LABEL: Record<MetricCategory, string> = {
  temperature: "Temperature",
  humidity: "Humidity",
  wind: "Wind",
  pressure: "Pressure",
  precipitation: "Precipitation",
  radiation: "Radiation & light",
  marine: "Marine & hydrology",
  soil: "Soil & vegetation",
  air_quality: "Air quality",
  lightning: "Lightning",
  device: "Device health",
  other: "Other",
};

/** Is it valid to average this metric arithmetically? */
export function canAverage(m: MetricDefinition) {
  return m.kind === "instantaneous" || m.kind === "rate";
}
