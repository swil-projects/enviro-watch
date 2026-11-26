# Integration research

Research date: 2026-11-13. Status legend: **Verified (docs)** = taken from official documentation; **Verified (live)** = confirmed against the live API with the configured credentials; **Assumption** = not confirmed.

## Summary

| Provider | Contract source | Discovery | Current readings | History | Live check |
|---|---|---|---|---|---|
| Ecowitt | Official API v3 docs (doc.ecowitt.net) | `device/list` | `device/real_time` (past 2 h) | `device/history` (5 min – 1 day) | ✅ healthy |
| LI-COR Cloud | OpenAPI document embedded in api.licor.cloud/v1/docs | none documented (serials from env) | derived from `/v1/data` trailing window | `/v1/data` | ✅ healthy |
| Obscape | **No public reference**; contract established empirically | project → station hierarchy | device data, default last 24 h | `from`/`to` windows | ✅ healthy |

---

## Ecowitt — API v3

Sources (verified docs): the ShowDoc site at `https://doc.ecowitt.net/web/#/apiv3en` (JS-rendered; content retrieved through its page API). Pages used: *Getting Device Real-Time Data* (17), *History Data* (19), *Device List* (21), *Device Detail* (23), *History Data Groups* (49), *Common Error Codes* (9), *API Permissions* (7).

- **Auth**: `application_key` + `api_key` query parameters (credentials in the URL → redacted from all logs/errors).
- **Device identity**: `mac` (`FF:FF:FF:FF:FF:FF`) or `imei` (15 digits).
- **Envelope**: `{ code, msg, time, data }`; `code: 0` = success. Errors still return HTTP 200 with a non-zero code.
- **Real-time** `GET /api/v3/device/real_time` — "data within the past 2 hrs". `call_back=all` (or comma-separated groups / `group.field`). Leaves are `{ time: "<unix s>", unit, value: "<string>" }`; groups nest (sub-devices like `WFC01-0xxxxxx8.daily`). Values are strings and may be empty.
- **Unit parameters**: `temp_unitid` (1 °C, 2 °F default), `pressure_unitid` (3 hPa, 4 inHg default, 5 mmHg), `wind_speed_unitid` (6 m/s, 7 km/h, 8 knots, 9 mph default, 10 BFT, 11 fpm), `rainfall_unitid` (12 mm, 13 in default), `solar_irradiance_unitid` (14 lux, 15 fc, 16 W/m² default), `capacity_unitid` (24 L, 25 m³, 26 gal). The platform requests metric units; the reported unit is still preserved per reading.
- **History** `GET /api/v3/device/history`: `start_date`, `end_date` (`yyyy-MM-dd HH:mm:ss`, inclusive), `cycle_type` (`auto`, `5min`, `30min`, `4hour`, `1day`), `call_back` required. Response leaves are `{ unit, list: { "<unix s>": "<value>" } }`. Retention / max span per request: 5 min → 90 days / 1 day; 30 min → 365 days / 1 week; 4 h → 730 days / 1 month; 1 day → 1460 days / 1 year.
- **Device list** `GET /api/v3/device/list` (`limit`, `page`): `id, name, mac|imei, type (1 weather, 2 camera), date_zone_id, longitude, latitude, stationtype, iotdevice_list`.
- **Device info** `GET /api/v3/device/info`: list fields + `device_status`, `last_update_time`, `last_update`.
- **Error codes**: −1 busy; 40000 illegal parameter; 40010/40011 illegal application/api key; 40012 illegal MAC/IMEI; 40013–40016 illegal start/end/cycle/call_back; 40017–40021 missing parameters; 45001 over the limit; 48001 privilege problem (full table mapped in `src/lib/integrations/ecowitt/mapping.ts`).
- **Rate limits**: not documented. Defaults: ≤3 concurrent requests, shared cached snapshots, retry with backoff on −1 / 45001 / 5xx.
- **Assumption**: the time zone of history `start_date`/`end_date` is not documented. The adapter formats them in the device's `date_zone_id` and then filters returned points by their unix timestamps to the exact UTC window, so the result is correct either way.

## LI-COR Cloud — External API v1

Source (verified docs): the OpenAPI 3.0 document embedded in `https://api.licor.cloud/v1/docs/swagger-ui-init.js` ("External API v1").

- **Auth**: `Authorization: Bearer <token>`.
- **`GET /v1/data`**: `loggers` (comma-separated serials), `start_date_time`, `end_date_time` — both **UTC**, format `yyyy-MM-dd HH:mm:ss`.
- **Response**: `{ message, max_results: boolean, data: [{ logger_sn, sensor_sn, timestamp, data_type, data_type_id, value, unit, sensor_measurement_type }] }`. `max_results: true` signals truncation.
- **Errors**: 400 `VAL-001…VAL-008`; 401/403 `ATH-001` invalid token; 429 `SYS-002` too many requests; 509 `SYS-001` system busy.
- Also documented: `GET /v1/newa/{device-serial-number}` (NEWA-format export). Not used.
- **Not documented**: device listing, logger names/locations, rate-limit values, boundary inclusivity, record cap. The platform therefore takes loggers from `LICOR_LOGGER_SERIALS`, never invents a location, treats boundaries as inclusive and deduplicates overlaps, and splits any truncated window in half recursively (down to 1 h) until `max_results` is false.
- **Verified (live)**: timestamps arrive as `yyyy-MM-dd HH:mm:ssZ`; the configured logger returns wind speed, gust, wind direction, rain and battery with `data_type: "CURRENT"`.

## Obscape — Data Portal API v3

Public sources: product pages only (site.obscape.com — "Option to forward the data to your own site via an easy-to-use API"). No API reference is public; the portal requires a client login. Unauthenticated calls return HTTP 400 with an empty body. `www.obscape.com` 301-redirects to `obscape.com`.

**Verified (live, 2026-11-13)** with the configured account — single endpoint `https://obscape.com/portal/api/v3/api`, credentials as `username` + `key` query parameters:

| Request | Response |
|---|---|
| *(no extra params)* | projects: `[{ name, timezone }]` |
| `project=<name>` | stations: `[{ id, name, latitude, longitude, reference, devices: { <type>: { serial, online, charged, inposition, inrange, settings } } }]` (`devices` is `[]` when none) |
| `project=<name>&station=<id>` | device types: `["camera", "wavegauge"]` (also seen: `weather`) |
| `…&device=<type>` | `{ data: [{ time: "<unix s>", <param>: number, …, invalid, oper, source, tstr: "YYYY-MM-DD HH:MM:SS [UTC]" }], parameters: [{ name, symbol, unit, caption }] }` — last 24 h |
| `…&device=<type>&from=YYYY-MM-DD HH:MM:SS&to=…` | the requested window, **interpreted as UTC** (confirmed for a project whose timezone is America/Bogota) |
| `…&device=camera&image=latest` | the newest captured **image** (binary JPEG, `Content-Type: image/jpeg`, ~0.5–1 MB) — this is what the Obscape portal's "Live data" camera view shows |
| `…&device=camera&image=<unix s>` | the image for the camera data row whose `time` equals that value; an unknown time returns HTTP 200 with the body `[]` |

Camera images (verified live, 2026-11-19): each camera data row (one per capture) is a frame; list frames from the `time` values of the normal `device=camera` data call (optionally with `from`/`to`), then fetch a frame with `image=<time>`. The dashboard proxies the bytes server-side (`/api/stations/[id]/camera/image`) so credentials never reach the browser.

Observations: unix timestamps for `from`/`to` → HTTP 500; `start`/`end`, `startdate`/`enddate`, `days` are ignored. Windows up to 90 days returned in full (~12.9k rows, 5.5 MB, ~1.2 s); the adapter still chunks to 31 days. Wave-gauge parameters seen: `level, wdepth, Hm0, Hmax, Hsw, Tp, Tsw, Tm01, Tm02, Tm10, Tavg, Tmax, Puu, SNR, lat, lon, VBAT, VSOL, TEMP, HUM, PATM, Xtilt, Ytilt, CSQ, RAT` with units `m, s, Hz, -, deg N, deg E, V, deg C, %, kPa, deg`.

Mapping decisions: `TEMP`/`HUM` are captioned *Internal temperature* / *Relative humidity (PTM)* → kept provider-specific, never merged with ambient air. `Tm01` and `Tm02` get separate keys. `lat`/`lon` are GPS fixes → station metadata, not series. `Puu` (spectrum) is not a scalar series. Rows with `invalid ≠ 0` are kept and flagged `provider_invalid`.

Unknown: rate limits, maximum window, whether `invalid` has more than two states, spectrum format. Re-verify with `npm run probe -- obscape` if Obscape changes the API.
