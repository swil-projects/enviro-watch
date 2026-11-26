import "server-only";
import { ProviderError, type ProviderErrorKind } from "./integrations/errors";
import type { ProviderType } from "./integrations/contracts";
import { redactText, redactUrl } from "./redact";
import { secretValues } from "./env";
import { log, setLogSecretsProvider } from "./logger";

setLogSecretsProvider(secretValues);

/** Only these hosts may ever be contacted. Prevents SSRF via configuration or user input. */
const ALLOWED_HOSTS: Record<ProviderType, string[]> = {
  OBSCAPE: ["obscape.com", "www.obscape.com"],
  LICOR: ["api.licor.cloud"],
  ECOWITT: ["api.ecowitt.net"],
};

export interface ProviderRequest {
  provider: ProviderType;
  url: URL;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  /** Label for logs, e.g. "real_time". */
  op: string;
  /**
   * Expect binary image bytes. A successful `image/*` response is returned as a `Uint8Array`;
   * any other successful response (e.g. a JSON `[]` for "no such image") goes through the normal JSON path.
   */
  binary?: boolean;
}

/** Hard cap so a misbehaving provider can never make us buffer an unbounded body. */
const MAX_BINARY_BYTES = 12 * 1024 * 1024;

export interface ProviderResponse<T = unknown> {
  status: number;
  body: T;
  latencyMs: number;
  attempts: number;
}

/** Per-provider concurrency limiter (simple semaphore). */
const LIMITS: Record<ProviderType, number> = { OBSCAPE: 2, LICOR: 2, ECOWITT: 3 };
type Sem = { active: number; queue: (() => void)[] };
const g = globalThis as unknown as { __providerSems?: Record<string, Sem> };
const sems = (g.__providerSems ??= {});

async function acquire(p: ProviderType) {
  const s = (sems[p] ??= { active: 0, queue: [] });
  if (s.active < LIMITS[p]) {
    s.active++;
    return;
  }
  await new Promise<void>((res) => s.queue.push(res));
  s.active++;
}
function release(p: ProviderType) {
  const s = sems[p];
  if (!s) return;
  s.active--;
  s.queue.shift()?.();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function backoffDelay(attempt: number, baseMs = 500, capMs = 8000) {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2)); // "equal jitter"
}

export function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

function kindForStatus(status: number): ProviderErrorKind {
  if (status === 401) return "INVALID_CREDENTIALS";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 404) return "DEVICE_NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400 || status === 422) return "INVALID_REQUEST";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "INVALID_REQUEST";
}

/**
 * Perform a GET against a provider with timeout, bounded retries,
 * exponential backoff with jitter, Retry-After support and secret redaction.
 * Never logs credentials.
 */
export async function providerGet<T = unknown>(req: ProviderRequest): Promise<ProviderResponse<T>> {
  const { provider, url } = req;
  if (url.protocol !== "https:" || !ALLOWED_HOSTS[provider].includes(url.hostname)) {
    throw new ProviderError({ provider, kind: "INVALID_REQUEST", message: `Refusing to contact non-allow-listed host ${url.hostname}` });
  }
  const maxRetries = req.maxRetries ?? 2;
  const timeoutMs = req.timeoutMs ?? 20_000;
  const safeUrl = redactUrl(url);
  const secrets = secretValues();
  const started = Date.now();
  let lastErr: ProviderError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await acquire(provider);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "EnvironmentalMonitoringPlatform/1.0", ...req.headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
        redirect: "follow",
      });
    } catch (e) {
      release(provider);
      const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      lastErr = new ProviderError({
        provider,
        kind: isTimeout ? "TIMEOUT" : "NETWORK",
        message: isTimeout ? `Timed out after ${timeoutMs} ms` : redactText(`Network error: ${(e as Error).message}`, secrets),
      });
      log.warn("provider.request.failed", { provider, op: req.op, url: safeUrl, attempt, kind: lastErr.kind });
      if (attempt < maxRetries) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw lastErr;
    }

    let text = "";
    let bytes: Uint8Array | undefined;
    try {
      if (req.binary) {
        const buf = new Uint8Array(await res.arrayBuffer());
        if (res.ok && (res.headers.get("content-type") ?? "").toLowerCase().startsWith("image/") && buf.byteLength <= MAX_BINARY_BYTES) bytes = buf;
        else text = new TextDecoder().decode(buf.subarray(0, 1_000_000));
      } else {
        text = await res.text();
      }
    } finally {
      release(provider);
    }

    // Redirects must stay on allow-listed hosts.
    if (res.url) {
      try {
        const finalHost = new URL(res.url).hostname;
        if (!ALLOWED_HOSTS[provider].includes(finalHost)) {
          throw new ProviderError({ provider, kind: "INVALID_REQUEST", message: `Provider redirected to non-allow-listed host ${finalHost}` });
        }
      } catch (e) {
        if (e instanceof ProviderError) throw e;
      }
    }

    if (res.ok && bytes) {
      log.info("provider.request.ok", { provider, op: req.op, url: safeUrl, status: res.status, ms: Date.now() - started, attempt, bytes: bytes.byteLength });
      return { status: res.status, body: bytes as T, latencyMs: Date.now() - started, attempts: attempt + 1 };
    }

    if (res.ok) {
      let body: unknown = text;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json") || /^\s*[[{]/.test(text)) {
        try {
          body = text.trim() === "" ? null : JSON.parse(text);
        } catch {
          throw new ProviderError({ provider, kind: "MALFORMED_RESPONSE", status: res.status, message: "Response was not valid JSON" });
        }
      }
      log.info("provider.request.ok", { provider, op: req.op, url: safeUrl, status: res.status, ms: Date.now() - started, attempt });
      return { status: res.status, body: body as T, latencyMs: Date.now() - started, attempts: attempt + 1 };
    }

    const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
    const snippet = redactText(text.slice(0, 300), secrets);
    lastErr = new ProviderError({
      provider,
      kind: kindForStatus(res.status),
      status: res.status,
      retryAfterMs,
      providerCode: extractCode(text),
      message: `HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`,
    });
    log.warn("provider.request.http_error", { provider, op: req.op, url: safeUrl, status: res.status, attempt });

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) throw lastErr;
    const wait = Math.min(retryAfterMs ?? backoffDelay(attempt), 30_000);
    await sleep(wait);
  }
  throw lastErr ?? new ProviderError({ provider, kind: "NETWORK", message: "Request failed" });
}

function extractCode(text: string): string | undefined {
  const m = text.match(/\b([A-Z]{2,4}-\d{3})\b/);
  return m?.[1];
}
