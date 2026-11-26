import "server-only";

/**
 * Process-wide TTL cache with single-flight request coalescing.
 *
 * Because the platform has no database, this cache is what keeps many
 * simultaneous dashboard viewers from each triggering their own calls to the
 * provider APIs: concurrent callers for the same key share one in-flight
 * promise, and results are reused until they expire.
 *
 * It lives in memory per server instance (stored on globalThis so it survives
 * dev hot reloads). On multi-instance / serverless deployments each instance
 * keeps its own cache — see docs/deployment.md.
 */
interface Entry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

const g = globalThis as unknown as {
  __emCache?: Map<string, Entry<unknown>>;
  __emInflight?: Map<string, Promise<unknown>>;
};
const store = (g.__emCache ??= new Map());
const inflight = (g.__emInflight ??= new Map());
const MAX_ENTRIES = 500;

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>, opts: { force?: boolean } = {}): Promise<{ value: T; storedAt: number; hit: boolean }> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (!opts.force && hit && hit.expiresAt > now) return { value: hit.value, storedAt: hit.storedAt, hit: true };

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) {
    const value = await pending;
    return { value, storedAt: (store.get(key)?.storedAt ?? Date.now()), hit: true };
  }

  const p = loader();
  inflight.set(key, p);
  try {
    const value = await p;
    const storedAt = Date.now();
    store.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
    if (store.size > MAX_ENTRIES) evict();
    return { value, storedAt, hit: false };
  } finally {
    inflight.delete(key);
  }
}

export function peek<T>(key: string): { value: T; storedAt: number } | null {
  const e = store.get(key) as Entry<T> | undefined;
  return e ? { value: e.value, storedAt: e.storedAt } : null;
}

export function invalidate(prefix: string) {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

function evict() {
  const now = Date.now();
  for (const [k, e] of store) if (e.expiresAt < now) store.delete(k);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Small key/value memory for things like "last successful request" per provider. */
const g2 = globalThis as unknown as { __emState?: Map<string, unknown> };
const state = (g2.__emState ??= new Map());
export function setState(k: string, v: unknown) {
  state.set(k, v);
}
export function getState<T>(k: string): T | undefined {
  return state.get(k) as T | undefined;
}
