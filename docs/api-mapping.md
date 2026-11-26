# API mapping

## Internal API (all JSON `{ data }` / `{ error: { code, message, details } }`, authenticated, `Cache-Control: private, no-store`)

| Method & path | Query / body | Returns |
|---|---|---|
| GET `/api/healthz` | – (no auth) | liveness |
| POST `/api/auth/login` | `{ username, password }` | sets session cookie (10 failed attempts / 15 min / IP) |
| POST `/api/auth/logout` | – | clears cookie |
| GET `/api/dashboard/overview` | – | KPIs, provider summaries, headline metrics, stations, active alerts |
| GET `/api/providers/status` | – | provider summaries |
| GET `/api/live` | – | full unified snapshot (stations, series, latest) |
| GET `/api/stations` | `provider?`, `q?`, `page`, `pageSize ≤ 200` | paginated inventory |
| GET `/api/stations/[id]` | – | one station view |
| GET `/api/stations/[id]/camera` | `range=6h\|24h\|7d\|30d` (default `24h`) | Obscape camera frame list `{ device, frames: [{ t, at }] }` (oldest → newest) |
| GET `/api/stations/[id]/camera/image` | `t=latest\|<unix s>`, `download=1?` | the JPEG itself (binary, not JSON; `private` browser cache — `max-age=60` for `latest`, immutable for a specific frame) |
| GET `/api/observations/latest` | `provider?`, `stationId?`, `metric?` | latest normalized observations |
| GET `/api/observations/raw` | `stationId`, `series?`, `metric?`, range, `page`, `pageSize ≤ 500`, `order` | paginated provider history |
| GET `/api/observations/export` | `stationId`, `series?`, `metric?`, range | CSV (formula-injection safe) |
| GET `/api/analytics/timeseries` | `metric`, `stations?` (≤12), `series?`, range, `maxPoints` | aligned lines + stats, gaps, completeness |
| GET `/api/analytics/summary` | `metric`, `stations?`, range | current vs previous period |
| GET `/api/alerts` | – | rules, active, recently resolved |
| POST `/api/alerts/rules` | rule JSON | upsert rule |
| DELETE `/api/alerts/rules?id=` | – | delete rule |
| POST `/api/refresh` | – | bypass caches (429 if < 30 s since last) |
| GET `/api/integrations/health` | `force=1?` | per-provider health steps, errors, redacted response shape |

Range = `range=1h|6h|24h|7d|30d` or `range=custom&start=<ISO>&end=<ISO>`; bounded by `MAX_HISTORY_DAYS`.

## Provider → canonical metrics

### Ecowitt (`group.field`)
| Field | Metric |
|---|---|
| outdoor.temperature / feels_like / app_temp / dew_point / humidity / vpd | air_temperature / feels_like_temperature / apparent_temperature / dew_point / relative_humidity / vapor_pressure_deficit |
| indoor.temperature / humidity | indoor_air_temperature / indoor_relative_humidity |
| wind.wind_speed / wind_gust / wind_direction / 10_minute_average_wind_direction | wind_speed / wind_gust / wind_direction / wind_direction_10min |
| pressure.relative / absolute | pressure_sea_level / pressure_station |
| rainfall(_piezo).rain_rate / daily / event / hourly, 1_hour / 24_hours / weekly / monthly / yearly | rain_rate / rain_daily / rain_event / rain_hourly / rain_24h / rain_weekly / rain_monthly / rain_yearly |
| solar_and_uvi.solar / uvi | solar_radiation (illuminance if lux/fc) / uv_index |
| lightning.distance / count | lightning_distance / lightning_count |
| pm25_chN.pm25, *_aqi_combo.pm1/pm4/pm10/pm25, *co2*.co2 | pm1 / pm4 / pm10 / pm25 / co2 |
| soil_chN.soilmoisture, leaf_chN.leaf_wetness | soil_moisture_percent / leaf_wetness |
| battery.* | battery_voltage (V) / battery_percent (%) / battery_state (codes) |
| temp_and_humidity_chN.*, temp_chN.*, everything else | `ecowitt:<path>` (location unknown → not merged) |

### LI-COR (`sensor_measurement_type` + `data_type` + unit)
Temperature → air_temperature (water/soil temperature separately); RH → relative_humidity; Dew Point; Wind Speed / Gust Speed / Wind Direction; Solar Radiation; PAR; Rain → rain_interval; Water Level; Pressure → barometric_pressure; Water Content → soil_moisture_vwc; Leaf Wetness; VPD; Battery. A `Max`/`Min`/`StdDev` statistic becomes `licor:<metric>_max|_min|_stddev`. Unrecognised → `licor:<type>_<stat>`.

### Obscape (`device.param`)
level → water_level · wdepth → water_depth · Hm0 → wave_height_significant · Hmax → wave_height_max · Hsw → swell_height · Tp → wave_period_peak · Tsw → swell_period · Tm01 → wave_period_tm01 · Tm02 → wave_period_tm02 · VBAT → battery_voltage · VSOL → solar_panel_voltage · PATM (kPa) → barometric_pressure (hPa) · TEMP/HUM (internal) and all others → `obscape:<param>` · lat/lon → GPS metadata · Puu (spectrum) → not ingested.
