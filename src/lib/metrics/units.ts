/**
 * Unit normalization. Canonical-unit policy (SI-leaning, meteorological conventions):
 *
 *   temperature        °C        pressure          hPa
 *   speed              m/s       length (precip)   mm
 *   rain rate          mm/h      length (water)    m
 *   distance           km        irradiance        W/m²
 *   illuminance        lux       angle             °
 *
 * Every conversion is exact or uses the internationally defined factor.
 * Values in unknown units are passed through unchanged and flagged.
 */

export type Dimension =
  | "temperature"
  | "pressure"
  | "speed"
  | "precip_depth"
  | "precip_rate"
  | "water_length"
  | "distance"
  | "irradiance"
  | "illuminance"
  | "angle"
  | "ratio_percent"
  | "vwc"
  | "concentration_mass"
  | "concentration_ppm"
  | "voltage"
  | "time"
  | "dimensionless"
  | "par"
  | "conductivity";

interface UnitDef {
  symbol: string;
  dimension: Dimension;
  /** Converts a value in this unit to the dimension's canonical unit. */
  toCanonical: (v: number) => number;
}

const id = (v: number) => v;

const UNITS: Record<string, UnitDef> = {
  // temperature
  "°C": { symbol: "°C", dimension: "temperature", toCanonical: id },
  "°F": { symbol: "°F", dimension: "temperature", toCanonical: (v) => ((v - 32) * 5) / 9 },
  K: { symbol: "K", dimension: "temperature", toCanonical: (v) => v - 273.15 },
  // pressure
  hPa: { symbol: "hPa", dimension: "pressure", toCanonical: id },
  mbar: { symbol: "mbar", dimension: "pressure", toCanonical: id },
  Pa: { symbol: "Pa", dimension: "pressure", toCanonical: (v) => v / 100 },
  kPa: { symbol: "kPa", dimension: "pressure", toCanonical: (v) => v * 10 },
  inHg: { symbol: "inHg", dimension: "pressure", toCanonical: (v) => v * 33.8638866667 },
  mmHg: { symbol: "mmHg", dimension: "pressure", toCanonical: (v) => v * 1.33322387415 },
  // speed
  "m/s": { symbol: "m/s", dimension: "speed", toCanonical: id },
  "km/h": { symbol: "km/h", dimension: "speed", toCanonical: (v) => v / 3.6 },
  mph: { symbol: "mph", dimension: "speed", toCanonical: (v) => v * 0.44704 },
  knots: { symbol: "knots", dimension: "speed", toCanonical: (v) => v * (1852 / 3600) },
  fpm: { symbol: "fpm", dimension: "speed", toCanonical: (v) => v * 0.00508 },
  // precipitation depth
  mm: { symbol: "mm", dimension: "precip_depth", toCanonical: id },
  in: { symbol: "in", dimension: "precip_depth", toCanonical: (v) => v * 25.4 },
  // precipitation rate
  "mm/h": { symbol: "mm/h", dimension: "precip_rate", toCanonical: id },
  "in/h": { symbol: "in/h", dimension: "precip_rate", toCanonical: (v) => v * 25.4 },
  // water length / level / wave height
  m: { symbol: "m", dimension: "water_length", toCanonical: id },
  cm: { symbol: "cm", dimension: "water_length", toCanonical: (v) => v / 100 },
  ft: { symbol: "ft", dimension: "water_length", toCanonical: (v) => v * 0.3048 },
  // distance
  km: { symbol: "km", dimension: "distance", toCanonical: id },
  mi: { symbol: "mi", dimension: "distance", toCanonical: (v) => v * 1.609344 },
  // radiation / light
  "W/m²": { symbol: "W/m²", dimension: "irradiance", toCanonical: id },
  lux: { symbol: "lux", dimension: "illuminance", toCanonical: id },
  fc: { symbol: "fc", dimension: "illuminance", toCanonical: (v) => v * 10.7639104 },
  "µmol/m²/s": { symbol: "µmol/m²/s", dimension: "par", toCanonical: id },
  // misc
  "°": { symbol: "°", dimension: "angle", toCanonical: id },
  "%": { symbol: "%", dimension: "ratio_percent", toCanonical: id },
  "m³/m³": { symbol: "m³/m³", dimension: "vwc", toCanonical: id },
  "µg/m³": { symbol: "µg/m³", dimension: "concentration_mass", toCanonical: id },
  ppm: { symbol: "ppm", dimension: "concentration_ppm", toCanonical: id },
  V: { symbol: "V", dimension: "voltage", toCanonical: id },
  s: { symbol: "s", dimension: "time", toCanonical: id },
  "mS/cm": { symbol: "mS/cm", dimension: "conductivity", toCanonical: id },
  "": { symbol: "", dimension: "dimensionless", toCanonical: id },
};

export const CANONICAL_UNIT: Record<Dimension, string> = {
  temperature: "°C",
  pressure: "hPa",
  speed: "m/s",
  precip_depth: "mm",
  precip_rate: "mm/h",
  water_length: "m",
  distance: "km",
  irradiance: "W/m²",
  illuminance: "lux",
  angle: "°",
  ratio_percent: "%",
  vwc: "m³/m³",
  concentration_mass: "µg/m³",
  concentration_ppm: "ppm",
  voltage: "V",
  time: "s",
  dimensionless: "",
  par: "µmol/m²/s",
  conductivity: "mS/cm",
};

/** Map of provider spelling → registry key. Keys are compared after lower-casing and whitespace removal. */
const ALIASES: Record<string, string> = {
  "°c": "°C", "ºc": "°C", "℃": "°C", c: "°C", degc: "°C", "deg c": "°C", celsius: "°C",
  "°f": "°F", "ºf": "°F", "℉": "°F", f: "°F", degf: "°F", fahrenheit: "°F",
  k: "K", kelvin: "K",
  hpa: "hPa", mbar: "mbar", mb: "mbar", millibar: "mbar", pa: "Pa", kpa: "kPa", inhg: "inHg", mmhg: "mmHg",
  "m/s": "m/s", mps: "m/s", "ms-1": "m/s", "m s-1": "m/s",
  "km/h": "km/h", kmh: "km/h", kph: "km/h",
  mph: "mph", "mi/h": "mph",
  knots: "knots", knot: "knots", kn: "knots", kt: "knots", kts: "knots",
  fpm: "fpm", "ft/min": "fpm",
  mm: "mm", in: "in", inch: "in", inches: "in", '"': "in",
  "mm/h": "mm/h", "mm/hr": "mm/h", "mm/hour": "mm/h", "in/h": "in/h", "in/hr": "in/h", "in/hour": "in/h",
  m: "m", meter: "m", meters: "m", metre: "m", metres: "m", cm: "cm", ft: "ft", feet: "ft",
  km: "km", mi: "mi", miles: "mi",
  "w/m²": "W/m²", "w/m2": "W/m²", "w/m^2": "W/m²", "wm-2": "W/m²",
  lux: "lux", lx: "lux", klux: "lux", fc: "fc",
  "µmol/m²/s": "µmol/m²/s", "umol/m2/s": "µmol/m²/s", "µmol/m2/s": "µmol/m²/s", "µmol/m²s": "µmol/m²/s", "umol/m^2/s": "µmol/m²/s",
  "°": "°", "º": "°", deg: "°", "deg n": "°", "deg e": "°", degrees: "°", "°n": "°",
  "%": "%", "%rh": "%", rh: "%", percent: "%",
  "m³/m³": "m³/m³", "m3/m3": "m³/m³", "m^3/m^3": "m³/m³",
  "µg/m3": "µg/m³", "µg/m³": "µg/m³", "ug/m3": "µg/m³", "μg/m3": "µg/m³", "μg/m³": "µg/m³",
  ppm: "ppm",
  v: "V", volt: "V", volts: "V",
  s: "s", sec: "s", seconds: "s",
  "ms/cm": "mS/cm",
  "": "",
  "-": "",
};

export function resolveUnit(raw: string | null | undefined): UnitDef | null {
  const k = (raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
  // klux special case: scale to lux
  if (k === "klux") return { symbol: "klux", dimension: "illuminance", toCanonical: (v) => v * 1000 };
  const key = ALIASES[k] ?? ALIASES[(raw ?? "").trim().toLowerCase()];
  if (key === undefined) return null;
  return UNITS[key] ?? null;
}

export interface ConversionResult {
  value: number;
  unit: string;
  converted: boolean;
  /** Set when the reported unit is not recognised or incompatible with the metric. */
  flag?: "unknown_unit" | "unit_dimension_mismatch";
}

/**
 * Convert `value` reported in `rawUnit` to the canonical unit of `expected`.
 * If `expected` is undefined, the unit's own dimension canonical is used.
 */
export function toCanonical(value: number, rawUnit: string | null | undefined, expected?: Dimension): ConversionResult {
  const def = resolveUnit(rawUnit);
  if (!def) return { value, unit: (rawUnit ?? "").trim(), converted: false, flag: "unknown_unit" };
  if (expected && def.dimension !== expected) {
    return { value, unit: def.symbol, converted: false, flag: "unit_dimension_mismatch" };
  }
  const canonical = CANONICAL_UNIT[def.dimension];
  if (def.symbol === canonical) return { value, unit: canonical, converted: false };
  return { value: def.toCanonical(value), unit: canonical, converted: true };
}

export function unitDimension(rawUnit: string | null | undefined): Dimension | null {
  return resolveUnit(rawUnit)?.dimension ?? null;
}
