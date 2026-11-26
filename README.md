# EnviroWatch — Unified Environmental Monitoring

One dashboard for **Obscape** (wave buoys, tide gauges, cameras), **LI-COR Cloud** (HOBO loggers) and **Ecowitt** (weather stations). Data is fetched from the three provider APIs on demand, validated, normalized into one model (canonical units, UTC, comparable metric keys) and merged in memory — **no database**.

**Status (2026-11-13):** all three integrations verified healthy against the live APIs with the configured account.

## Quick start
```bash
npm install
cp .env.example .env          # add provider credentials
npm run probe                 # check connectivity (redacted output)
npm run dev                   # http://localhost:3000
```
- No credentials yet? `DEMO_MODE=true` shows clearly labelled synthetic data.
- Skip the login while evaluating locally: `AUTH_DISABLED=true`.

## Features
Overview KPIs & provider status · current conditions with 24 h sparklines · live monitoring (polling, freshness, collection delay) · unified station inventory and detail pages · map of real coordinates · cross-provider analytics (kind-aware statistics, resampling, gaps, completeness, period-over-period) · historical charts · data explorer with CSV export · threshold/staleness/integration alerts · integration health diagnostics · light/dark themes · responsive.

## Analytics and reliability

- The overview includes a network reporting breakdown, available/discovered series counts, and provider quality-flag counts. Reporting measures freshness, not historical uptime.
- History views include per-sensor P10–P90 ranges, sample standard deviation, time-based linear slopes and R², estimated coverage, and IQR outlier counts. These describe returned samples; they are not forecasts or safety thresholds. Arithmetic distribution and regression are limited to instantaneous metrics and rates.
- **Export analysis** downloads the selected chart's series statistics, period boundaries, quality flags, coverage and truncation/error information as CSV. Empty fields mean unavailable or inapplicable, never zero.
- History is sorted, deduplicated by series and timestamp (newest retrieval wins), and filtered to half-open `[start, end)` windows after cache retrieval. Invalid values/timestamps are excluded. Adjacent comparison windows cannot double count a boundary sample.
- Relative history windows refresh every minute. Changing measurement resets eligible station selection, cancels obsolete requests, and loads matching data without relabeling an old chart. Failed requests offer retry; overview refresh failures explicitly identify the retained snapshot.
- Period comparisons expose coverage for both windows and warn about missing/truncated history. Means, quantiles and regression are sample-based rather than time-weighted; quality-flagged values are retained and disclosed.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, then `npm run test:e2e`. Browser tests use synthetic provider data with authentication enabled; live provider availability is a separate operational check (`npm run probe`). The application still uses process-local caching, with no persistent history database; see deployment documentation for multi-instance limits.

## Docs
- [Integration research](docs/integration-research.md) — verified contracts, sources, assumptions
- [Architecture](docs/architecture.md) — layers, data model, caching, limitations
- [API mapping](docs/api-mapping.md) — internal API and provider → metric mapping
- [Setup](docs/setup.md) · [Deployment](docs/deployment.md)

## Stack
Next.js 16 (App Router, Cache Components) · React 19 · TypeScript strict · Tailwind CSS 4 · TanStack Query & Table · ECharts · Leaflet · Zod · jose · Vitest · Playwright.
