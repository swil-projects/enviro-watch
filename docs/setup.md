# Local setup

Requirements: Node.js ≥ 20.9 (developed on Node 25), npm. **No database or Docker needed.**

1. **Install**: `npm install`
2. **Configure**: `cp .env.example .env` and fill in the provider credentials (see comments in the file).
   - Skip login while evaluating: `AUTH_DISABLED=true` (local only).
   - Explore without credentials: `DEMO_MODE=true` (clearly labelled synthetic data; never used as a fallback for failing live APIs).
3. **Check connectivity**: `npm run probe` (or `npm run probe -- obscape|licor|ecowitt`). Prints each health step and a redacted response shape — no values, no secrets.
4. **Run**: `npm run dev` → http://localhost:3000. Data is fetched on first page load and cached for `REFRESH_INTERVAL_SECONDS`.
5. **Verify**: open *Integration Health*; all three panels should be green.

## Quality gates
```
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest: unit + adapter integration tests (mocked fetch, fixtures)
npm run build          # production build
npm run test:e2e       # Playwright against the production build in DEMO mode (run build first;
                       # first time: npx playwright install chromium)
npm run check          # typecheck + lint + test + build
```

## Configuration reference
See `.env.example`. Key settings: `REFRESH_INTERVAL_SECONDS` (API call budget), `STALE_AFTER_MINUTES` (freshness: stale after N, offline after 6N), `MAX_HISTORY_DAYS` (largest history query), `APP_TIMEZONE` (default display zone; users can override in Settings), `OBSCAPE_PROJECTS` (optional project filter), `ECOWITT_DEVICE_MACS` (devices on the account are also auto-discovered).
