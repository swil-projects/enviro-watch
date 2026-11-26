import { redactText } from "./redact";

/**
 * Minimal structured logger. All string fields pass through redaction before
 * being written, using the configured secret values when available.
 */
type Fields = Record<string, unknown>;

let secretsProvider: () => string[] = () => [];
export function setLogSecretsProvider(fn: () => string[]) {
  secretsProvider = fn;
}

function emit(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test") return;
  const secrets = secretsProvider();
  const safe: Fields = {};
  for (const [k, v] of Object.entries(fields)) safe[k] = typeof v === "string" ? redactText(v, secrets) : v;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV === "production") console.log(line);
}

export const log = {
  info: (e: string, f?: Fields) => emit("info", e, f),
  warn: (e: string, f?: Fields) => emit("warn", e, f),
  error: (e: string, f?: Fields) => emit("error", e, f),
};
