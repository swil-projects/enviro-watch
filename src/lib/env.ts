import "server-only";
import { z } from "zod";

/**
 * Server-side environment contract. Validated lazily (on first use) so that a
 * missing provider credential only disables that provider instead of crashing
 * the whole application.
 */

const csv = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const IMEI_RE = /^\d{15}$/;

const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://"), "must use https://");

const EnvSchema = z.object({
  APP_TIMEZONE: z.string().default("America/Jamaica"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  REFRESH_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  MAX_HISTORY_DAYS: z.coerce.number().int().min(1).max(1460).default(90),
  STALE_AFTER_MINUTES: z.coerce.number().int().min(5).max(10080).default(60),

  OBSCAPE_BASE_URL: httpsUrl.default("https://obscape.com/portal/api/v3/api"),
  OBSCAPE_USERNAME: z.string().optional(),
  OBSCAPE_API_KEY: z.string().optional(),
  OBSCAPE_PROJECTS: z.string().optional(),

  LICOR_BASE_URL: httpsUrl.default("https://api.licor.cloud"),
  LICOR_API_TOKEN: z.string().optional(),
  LICOR_LOGGER_SERIALS: z.string().optional(),

  ECOWITT_BASE_URL: httpsUrl.default("https://api.ecowitt.net"),
  ECOWITT_APPLICATION_KEY: z.string().optional(),
  ECOWITT_API_KEY: z.string().optional(),
  ECOWITT_DEVICE_MACS: z.string().optional(),

  AUTH_SECRET: z.string().optional(),
  AUTH_USERNAME: z.string().optional(),
  AUTH_PASSWORD: z.string().optional(),
});

export type AppEnv = {
  appTimezone: string;
  demoMode: boolean;
  refreshIntervalSeconds: number;
  maxHistoryDays: number;
  staleAfterMinutes: number;
  obscape: {
    baseUrl: string;
    username?: string;
    apiKey?: string;
    projects: string[];
    configured: boolean;
  };
  licor: {
    baseUrl: string;
    token?: string;
    loggerSerials: string[];
    configured: boolean;
  };
  ecowitt: {
    baseUrl: string;
    applicationKey?: string;
    apiKey?: string;
    devices: { mac?: string; imei?: string }[];
    invalidDeviceIds: string[];
    configured: boolean;
  };
  auth: {
    secret?: string;
    username?: string;
    password?: string;
    enabled: boolean;
  };
  /** Human-readable configuration problems (never contains secret values). */
  problems: string[];
};

let cached: AppEnv | null = null;

const blankToUndef = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : undefined);

export function getEnv(): AppEnv {
  if (cached) return cached;
  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(EnvSchema.shape)) raw[key] = blankToUndef(process.env[key]);

  const parsed = EnvSchema.safeParse(raw);
  const problems: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`${issue.path.join(".")}: ${issue.message}`);
  }
  // Fall back to defaults for invalid fields so the app can still render a diagnostics page.
  const e = parsed.success ? parsed.data : EnvSchema.parse({});

  const ecowittDevices: { mac?: string; imei?: string }[] = [];
  const invalidDeviceIds: string[] = [];
  for (const id of csv(raw.ECOWITT_DEVICE_MACS)) {
    const up = id.toUpperCase();
    if (MAC_RE.test(up)) ecowittDevices.push({ mac: up });
    else if (IMEI_RE.test(id)) ecowittDevices.push({ imei: id });
    else invalidDeviceIds.push(id);
  }
  if (invalidDeviceIds.length) problems.push(`ECOWITT_DEVICE_MACS contains ${invalidDeviceIds.length} invalid MAC/IMEI value(s)`);

  const loggerSerials = csv(raw.LICOR_LOGGER_SERIALS).filter((s) => {
    const ok = /^[A-Za-z0-9-]{4,32}$/.test(s);
    if (!ok) problems.push(`LICOR_LOGGER_SERIALS contains an invalid serial`);
    return ok;
  });

  const auth = {
    secret: raw.AUTH_SECRET,
    username: raw.AUTH_USERNAME,
    password: raw.AUTH_PASSWORD,
    enabled: Boolean(raw.AUTH_SECRET && raw.AUTH_USERNAME && raw.AUTH_PASSWORD),
  };
  if (auth.secret && auth.secret.length < 32) problems.push("AUTH_SECRET should be at least 32 characters");

  cached = {
    appTimezone: e.APP_TIMEZONE,
    demoMode: e.DEMO_MODE,
    refreshIntervalSeconds: e.REFRESH_INTERVAL_SECONDS,
    maxHistoryDays: e.MAX_HISTORY_DAYS,
    staleAfterMinutes: e.STALE_AFTER_MINUTES,
    obscape: {
      baseUrl: e.OBSCAPE_BASE_URL,
      username: e.OBSCAPE_USERNAME,
      apiKey: e.OBSCAPE_API_KEY,
      projects: csv(e.OBSCAPE_PROJECTS),
      configured: Boolean(e.OBSCAPE_USERNAME && e.OBSCAPE_API_KEY),
    },
    licor: {
      baseUrl: e.LICOR_BASE_URL,
      token: e.LICOR_API_TOKEN,
      loggerSerials,
      configured: Boolean(e.LICOR_API_TOKEN && loggerSerials.length),
    },
    ecowitt: {
      baseUrl: e.ECOWITT_BASE_URL,
      applicationKey: e.ECOWITT_APPLICATION_KEY,
      apiKey: e.ECOWITT_API_KEY,
      devices: ecowittDevices,
      invalidDeviceIds,
      configured: Boolean(e.ECOWITT_APPLICATION_KEY && e.ECOWITT_API_KEY),
    },
    auth,
    problems,
  };
  return cached;
}

/** Secret values currently configured — used by the log/URL redactor. */
export function secretValues(): string[] {
  const e = getEnv();
  return [e.obscape.apiKey, e.licor.token, e.ecowitt.applicationKey, e.ecowitt.apiKey, e.auth.secret, e.auth.password].filter(
    (v): v is string => Boolean(v && v.length >= 4),
  );
}

/** Test helper. */
export function __resetEnvCache() {
  cached = null;
}
