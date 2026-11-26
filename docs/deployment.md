# Deployment

## Recommended: a single long-running Node server
`npm ci && npm run build && npm start` (behind HTTPS, e.g. a reverse proxy or a PaaS such as Render, Fly.io, Railway, or a VM). Because the platform has **no database**, the in-memory cache is what bounds provider API usage, so one long-lived instance is the most efficient and predictable option.

## Serverless (e.g. Vercel)
Works, with trade-offs:
- Each function instance has its own cache → more provider calls under load, and cold starts re-fetch.
- Alert history and "last successful request" times reset with instances.
- Alert-rule editing from the UI fails on a read-only filesystem; edit `config/alert-rules.json` in the repo and redeploy.
- Long history queries (e.g. 90 days of Obscape data) take a few seconds — make sure the function timeout allows ≥ 30 s.
No cron job is required: data is pulled on demand.

## Required environment
All variables in `.env.example`. In production you **must** set `AUTH_SECRET` (≥ 32 random chars, `openssl rand -base64 48`), `AUTH_USERNAME` and `AUTH_PASSWORD` — without them every page and API is refused. **Never set `AUTH_DISABLED=true` on a reachable server.** Store secrets in the host's secret manager, never in the repo.

## Security checklist
- Provider credentials are server-only (no `NEXT_PUBLIC_` secrets), redacted from logs and error messages (Obscape/Ecowitt put keys in query strings).
- Outbound requests are restricted to `obscape.com`, `api.licor.cloud`, `api.ecowitt.net` over HTTPS (SSRF guard); redirects to other hosts are refused.
- Session cookie: httpOnly, SameSite=Lax, Secure in production, 12 h expiry. Login throttled to 10 failed attempts / 15 min / IP.
- Every route handler re-checks auth; mutating routes are POST/DELETE; all inputs are Zod-validated; history ranges are bounded.
- Responses are `Cache-Control: private, no-store`; security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`) are set by the proxy.

## Health & monitoring
- Liveness: `GET /api/healthz` (no auth, no provider calls).
- Provider health: `GET /api/integrations/health` (authenticated; lightweight checks, cached 60 s).
- Logs are single-line JSON (`provider.request.ok|failed|http_error`, `api.unhandled`) with secrets redacted — ship them to your log platform. Set `LOG_LEVEL=debug` to log successful requests in development.

## Backups
There is no database. The only state worth versioning is `config/alert-rules.json` (keep it in git) and your `.env` (keep it in a secret manager).
