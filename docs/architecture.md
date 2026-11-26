# Architecture

A modular Next.js 16 monolith (App Router, React 19, TypeScript strict, Cache Components). **No database**: all data comes from the provider APIs on demand and is merged in memory.

```
Browser ──► Next.js pages (RSC, streamed behind Suspense) ──► Unified data service ──► adapters ──► provider APIs
        └─► /api/* route handlers (Zod-validated, authorised) ─┘        │
                                                                   in-memory TTL cache
                                                                 + single-flight coalescing
```

## Layers (src/lib)

| Layer | Files | Responsibility |
|---|---|---|
| Configuration | `env.ts` | Zod-validated env; per-provider "configured" flags; never throws for a missing provider. |
| Provider communication | `http.ts`, `redact.ts`, `logger.ts` | HTTPS-only, host allow-list (SSRF guard), timeouts, bounded retries, exponential backoff + jitter, `Retry-After`, per-provider concurrency limits, secret redaction. |
| Adapters | `integrations/{ecowitt,licor,obscape,demo}` | Provider contracts, Zod response validation, discovery, latest, history, health checks. Implement `MonitoringProviderAdapter` (`integrations/contracts.ts`) and declare capabilities explicitly. |
| Normalization | `normalize.ts`, `metrics/registry.ts`, `metrics/units.ts` | Canonical metric keys, unit conversion, UTC timestamps, quality flags, deduplication. |
| Unified service | `service.ts`, `cache.ts`, `freshness.ts` | Merges providers, isolates failures, caches snapshots and history, classifies freshness. |
| Analytics | `analytics.ts`, `timeseries.ts` | Kind-aware statistics, bucketing/downsampling, gaps, completeness, cross-station alignment. |
| Alerts | `alerts.ts` | Rules from `config/alert-rules.json`, evaluation against the snapshot, in-memory active/resolved state. |
| Auth | `auth/session.ts`, `src/proxy.ts` | Env-configured credentials, signed JWT cookie, optimistic proxy check + authoritative per-request check. |

## Data model

`UnifiedStation` → `UnifiedSensor` → `UnifiedSeries` → `UnifiedObservation` (see `contracts.ts`). IDs are provider-scoped (`ecowitt~9C139E672F4C`, `licor~20029439`, `obscape~<project>-<id>`), so identical serials from different providers never collide. Every observation keeps `originalValue`, `originalUnit`, `observedAt` (UTC), `retrievedAt` and `origin` (`PROVIDER_REALTIME`, `PROVIDER_HISTORY`, `DEMO`).

### Canonical units
°C · hPa · m/s · mm · mm/h · m · km · W/m² · lux · ° · % · m³/m³ · µg/m³ · ppm · V · s.

### Metric kinds (drive valid aggregation)
| Kind | Example | Bucket statistic | Period comparison |
|---|---|---|---|
| instantaneous | temperature | mean (+min/max) | mean |
| rate | rain rate | mean | mean |
| interval_total | LI-COR rain per log interval | sum | total |
| running_total | Ecowitt daily rain counter | last value | not compared |
| direction | wind / wave direction | circular mean | not compared |
| state | battery code | last value | not compared |

Different physical meanings get different keys (relative vs absolute pressure, wind vs wave direction, Tm01 vs Tm02, logger internal vs ambient temperature, max vs average statistics). Unknown provider fields become `provider:<slug>` and are shown but never merged across providers.

## Caching & request budget (no database)

- **Snapshot** (stations + latest readings) per provider, reused for `REFRESH_INTERVAL_SECONDS` (default 120 s). Concurrent viewers share one in-flight request (single-flight), so API load does not scale with users.
- If a refresh fails, the last good snapshot is served **marked stale** with the error attached — real older data, never fabricated.
- **History** is cached per (station, series, rounded window): 2 min for windows ending now, 30 min for closed windows.
- **Manual refresh** bypasses the cache, rate-limited to once per 30 s server-wide.
- Per-provider concurrency limits: Obscape 2, LI-COR 2, Ecowitt 3.

Approximate calls per snapshot with the current account: Obscape 1 + projects + Σ devices ≈ 8; LI-COR 1–2; Ecowitt 1 + devices = 2.

## Limitations of the no-database design
- No accumulated local history: history is whatever each provider retains (Ecowitt up to 4 years at daily resolution; LI-COR and Obscape per account).
- Alert history and "last successful request" times are in memory and reset on restart.
- Each server instance has its own cache; on multi-instance / serverless hosting, API load scales with instance count.
- Alert-rule editing writes `config/alert-rules.json` and needs a writable filesystem.

## Rendering
Pages are Server Components that stream data behind `<Suspense>` (Cache Components / Partial Prerendering: static shell + streamed content). Interactive parts (charts, tables, filters, polling) are Client Components using TanStack Query against the internal API. ECharts and Leaflet are loaded dynamically on the client only.
