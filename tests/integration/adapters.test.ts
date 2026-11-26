import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const fixture = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures", n), "utf8"));
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const ENV = {
  ECOWITT_APPLICATION_KEY: "APPKEY_SECRET_123",
  ECOWITT_API_KEY: "APIKEY_SECRET_456",
  ECOWITT_DEVICE_MACS: "9C:13:9E:67:2F:4C",
  LICOR_API_TOKEN: "LICOR_TOKEN_789",
  LICOR_LOGGER_SERIALS: "20029439",
  OBSCAPE_USERNAME: "someone",
  OBSCAPE_API_KEY: "OBS_KEY_000",
  DEMO_MODE: "false",
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(ENV)) delete process.env[k];
});

const url = (call: unknown[]) => new URL(String(call[0]));

describe("Ecowitt adapter", () => {
  it("discovers devices, parses nested real-time groups and normalizes units", async () => {
    fetchMock.mockImplementation(async (u: URL) => {
      if (u.pathname.endsWith("/device/list")) return json({ code: 0, msg: "success", data: { total: 1, totalPage: 1, pageNum: 1, list: [{ id: 1, name: "Rooftop", mac: "9C:13:9E:67:2F:4C", type: 1, date_zone_id: "America/Jamaica", longitude: -76.79, latitude: 18.01, stationtype: "GW2000" }] } });
      return json(fixture("ecowitt-realtime.json"));
    });
    const { EcowittAdapter } = await import("@/lib/integrations/ecowitt/adapter");
    const snap = await new EcowittAdapter().fetchSnapshot();
    expect(snap.errors).toEqual([]);
    expect(snap.stations).toHaveLength(1);
    const s = snap.stations[0];
    expect(s.station).toMatchObject({ name: "Rooftop", latitude: 18.01, longitude: -76.79, timezone: "America/Jamaica" });
    const byKey = Object.fromEntries(s.latest.map((o) => [o.seriesId.split("|")[1], o]));
    expect(byKey["outdoor.temperature"].value).toBeCloseTo(29, 5);
    expect(byKey["outdoor.temperature"]).toMatchObject({ unit: "°C", originalUnit: "ºF", originalValue: "84.2", metricKey: "air_temperature" });
    expect(byKey["wind.wind_speed"].value).toBeCloseTo(4.4704, 4);
    expect(byKey["pressure.relative"].metricKey).toBe("pressure_sea_level");
    expect(byKey["rainfall_piezo.daily"].metricKey).toBe("rain_daily");
    expect(byKey["WFC01-0xxxxxx8.daily"]).toBeDefined(); // sub-device group preserved
    expect(byKey["outdoor.dew_point"]).toBeUndefined(); // empty value is missing, not zero
    expect(Object.keys(byKey).some((k) => k.startsWith("camera"))).toBe(false);
    // Metric unit ids are requested; credentials are sent only as documented query params.
    const rt = fetchMock.mock.calls.map(url).find((u) => u.pathname.endsWith("/real_time"))!;
    expect(rt.searchParams.get("temp_unitid")).toBe("1");
    expect(rt.searchParams.get("call_back")).toBe("all");
  });

  it("maps documented error codes and isolates per-device failures", async () => {
    fetchMock.mockImplementation(async (u: URL) => (u.pathname.endsWith("/device/list") ? json({ code: 40011, msg: "Illegal api_key", time: "1", data: [] }) : json({ code: 40012, msg: "Illegal MAC", time: "1", data: [] })));
    const { EcowittAdapter } = await import("@/lib/integrations/ecowitt/adapter");
    const snap = await new EcowittAdapter().fetchSnapshot();
    expect(snap.errors[0]).toMatchObject({ kind: "INVALID_CREDENTIALS", providerCode: 40011 });
    expect(snap.stations[0].errors[0]).toMatchObject({ kind: "DEVICE_NOT_FOUND" });
    expect(JSON.stringify(snap)).not.toContain("APIKEY_SECRET_456");
  });

  it("retrieves provider history with the documented cycle and filters to the requested window", async () => {
    fetchMock.mockResolvedValue(json(fixture("ecowitt-history.json")));
    const { EcowittAdapter, buildEcowittSeries } = await import("@/lib/integrations/ecowitt/adapter");
    const a = new EcowittAdapter();
    const station = { id: "ecowitt~9C139E672F4C", provider: "ECOWITT" as const, externalId: "9C:13:9E:67:2F:4C", name: "x", timezone: "America/Jamaica", isDemo: false, metadata: { mac: "9C:13:9E:67:2F:4C" } };
    const series = buildEcowittSeries(station, "outdoor.temperature", "℃").series;
    const start = new Date(1794560000 * 1000);
    const end = new Date(1794560700 * 1000); // excludes the 1794560900 point
    const h = await a.fetchHistory({ station, series: [series], start, end });
    expect(h.observations.map((o) => o.value)).toEqual([28.1, 28.3]); // "-" skipped, out-of-window dropped
    expect(h.observations[0].origin).toBe("PROVIDER_HISTORY");
    const q = url(fetchMock.mock.calls[0]).searchParams;
    expect(q.get("cycle_type")).toBe("5min");
    expect(q.get("call_back")).toBe("outdoor.temperature");
    expect(q.get("start_date")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("LI-COR adapter", () => {
  it("parses observations, discovers sensors and keeps statistics separate", async () => {
    fetchMock.mockResolvedValue(json(fixture("licor-data.json")));
    const { LicorAdapter } = await import("@/lib/integrations/licor/adapter");
    const snap = await new LicorAdapter().fetchSnapshot();
    expect(snap.errors).toEqual([]);
    const s = snap.stations[0];
    expect(s.station).toMatchObject({ externalId: "20029439", latitude: null, longitude: null });
    expect(s.sensors.map((x) => x.externalId).sort()).toEqual(["21111111", "21222222", "21333333"]);
    const latest = Object.fromEntries(s.latest.map((o) => [o.seriesId.split("|")[1], o]));
    expect(latest["21111111:1"]).toMatchObject({ value: 27.9, metricKey: "air_temperature", observedAt: "2026-11-13T12:15:00.000Z" });
    expect(latest["21222222:3"].metricKey).toBe("rain_interval");
    expect(latest["21333333:4"].metricKey).toBe("licor:wind_speed_max");
    expect(latest["21333333:5"]).toBeUndefined(); // null value
    const req = url(fetchMock.mock.calls[0]);
    expect(req.pathname).toBe("/v1/data");
    expect(req.searchParams.get("start_date_time")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer LICOR_TOKEN_789" });
  });

  it("splits truncated windows (max_results) and merges without loss", async () => {
    let n = 0;
    fetchMock.mockImplementation(async (u: URL) => {
      n++;
      const s = u.searchParams.get("start_date_time")!;
      if (n === 1) return json({ max_results: true, data: [] });
      return json({ max_results: false, data: [{ logger_sn: "20029439", sensor_sn: "1", timestamp: s.replace(" ", "T") + "Z", data_type: "Avg", data_type_id: "1", value: n, unit: "°C", sensor_measurement_type: "Temperature" }] });
    });
    const { LicorAdapter } = await import("@/lib/integrations/licor/adapter");
    const end = new Date("2026-11-12T00:00:00Z");
    const r = await new LicorAdapter().fetchWindow(["20029439"], new Date(end.getTime() - 4 * 3_600_000), end);
    expect(r.requests).toBe(3);
    expect(r.truncated).toBe(false);
    expect(r.records).toHaveLength(2);
  });

  it("classifies 401 and retries 429 honouring Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "ATH-001 Invalid token" }, 401));
    const { LicorAdapter } = await import("@/lib/integrations/licor/adapter");
    const bad = await new LicorAdapter().fetchSnapshot();
    expect(bad.errors[0]).toMatchObject({ kind: "INVALID_CREDENTIALS", status: 401, providerCode: "ATH-001" });

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response("SYS-002 Too many requests", { status: 429, headers: { "retry-after": "0" } })).mockResolvedValue(json({ max_results: false, data: [] }));
    const r = await new LicorAdapter().fetchRaw(["20029439"], new Date(Date.now() - 3_600_000), new Date());
    expect(r.records).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Obscape adapter (empirically verified API v3 contract)", () => {
  const route = (u: URL) => {
    const q = u.searchParams;
    if (!q.has("project")) return json([{ name: "Harbour", timezone: "America/Bogota" }]);
    if (!q.has("station")) return json(fixture("obscape-stations.json"));
    if (q.get("device") === "wavegauge") return json(fixture("obscape-wavegauge.json"));
    if (q.get("device") === "camera") return json({ data: [], parameters: [] });
    return json(["camera", "wavegauge"]);
  };

  it("walks projects → stations → devices and normalizes readings", async () => {
    fetchMock.mockImplementation(async (u: URL) => route(u));
    const { ObscapeAdapter } = await import("@/lib/integrations/obscape/adapter");
    const snap = await new ObscapeAdapter().fetchSnapshot();
    expect(snap.errors).toEqual([]);
    expect(snap.stations).toHaveLength(2);
    const [a, b] = snap.stations;
    expect(a.station).toMatchObject({ externalId: "101", name: "Buoy A", projectName: "Harbour", latitude: 17.9, longitude: -76.8, timezone: "America/Bogota", providerStatus: "All devices online" });
    expect(b.station).toMatchObject({ latitude: null, longitude: null, providerStatus: "No devices attached" }); // 0,0 is not a location
    expect(a.sensors.map((s) => s.externalId).sort()).toEqual(["CAM-1", "WG-1"]);
    const latest = Object.fromEntries(a.latest.map((o) => [o.seriesId.split("|")[1], o]));
    expect(latest["wavegauge.Hm0"]).toMatchObject({ value: 0.88, unit: "m", metricKey: "wave_height_significant", observedAt: "2026-11-13T09:10:00.000Z", qualityFlag: "provider_invalid" });
    expect(latest["wavegauge.TEMP"]).toMatchObject({ unit: "°C", metricKey: "obscape:temp" });
    expect(latest["wavegauge.PATM"].value).toBeCloseTo(1012.1, 3); // kPa → hPa
    expect(latest["wavegauge.lat"]).toBeUndefined(); // GPS fix is metadata, not a measurement
    expect(latest["wavegauge.Puu"]).toBeUndefined(); // spectrum is not a scalar series
    expect(a.station.metadata.gps_wavegauge).toMatchObject({ lat: 17.90003 });
    // Credentials only travel as the documented query parameters.
    const q = url(fetchMock.mock.calls[0]).searchParams;
    expect(q.get("username")).toBe("someone");
  });

  it("requests history with UTC from/to strings, per device", async () => {
    fetchMock.mockImplementation(async (u: URL) => route(u));
    const { ObscapeAdapter } = await import("@/lib/integrations/obscape/adapter");
    const a = new ObscapeAdapter();
    const snap = await a.fetchSnapshot();
    const s = snap.stations[0];
    fetchMock.mockClear();
    const h = await a.fetchHistory({ station: s.station, series: s.series.filter((x) => x.sourceKey === "wavegauge.Hm0"), start: new Date("2026-11-13T08:00:00Z"), end: new Date("2026-11-13T10:00:00Z") });
    expect(h.observations.map((o) => o.value)).toEqual([0.82, 0.88]);
    const q = url(fetchMock.mock.calls[0]).searchParams;
    expect(q.get("device")).toBe("wavegauge");
    expect(q.get("from")).toBe("2026-11-13 08:00:00");
    expect(q.get("to")).toBe("2026-11-13 10:00:00");
  });

  it("isolates a failing device and reports an empty 400 without leaking the key", async () => {
    fetchMock.mockImplementation(async (u: URL) => (u.searchParams.get("device") === "wavegauge" ? new Response("", { status: 500 }) : route(u)));
    const { ObscapeAdapter } = await import("@/lib/integrations/obscape/adapter");
    const snap = await new ObscapeAdapter().fetchSnapshot();
    expect(snap.stations[0].errors[0]).toMatchObject({ kind: "PROVIDER_UNAVAILABLE", status: 500 });
    expect(JSON.stringify(snap)).not.toContain("OBS_KEY_000");

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("bad key OBS_KEY_000", { status: 400 }));
    const bad = await new ObscapeAdapter().fetchSnapshot();
    expect(bad.errors[0]).toMatchObject({ kind: "INVALID_REQUEST", status: 400 });
    expect(bad.errors[0].message).not.toContain("OBS_KEY_000");
  }, 30_000);

  it("refuses to contact hosts outside the allow-list", async () => {
    process.env.OBSCAPE_BASE_URL = "https://evil.example.com/api";
    const { ObscapeAdapter } = await import("@/lib/integrations/obscape/adapter");
    const snap = await new ObscapeAdapter().fetchSnapshot();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.errors[0].message).toMatch(/non-allow-listed/);
    delete process.env.OBSCAPE_BASE_URL;
  });
});

describe("unified service", () => {
  it("isolates a failing provider from the others and never substitutes fake data", async () => {
    fetchMock.mockImplementation(async (u: URL) => {
      if (u.hostname === "api.licor.cloud") return json(fixture("licor-data.json"));
      if (u.hostname === "api.ecowitt.net") return new Response("upstream down", { status: 503 });
      return new Response("", { status: 400 });
    });
    const { getUnifiedSnapshot } = await import("@/lib/service");
    const snap = await getUnifiedSnapshot({ force: true });
    const by = Object.fromEntries(snap.providers.map((p) => [p.provider, p]));
    expect(by.LICOR.stations[0].latest.length).toBeGreaterThan(0);
    expect(by.ECOWITT.errors[0].kind).toBe("PROVIDER_UNAVAILABLE");
    expect(by.ECOWITT.stations.every((s) => s.latest.length === 0)).toBe(true);
    expect(snap.stations.some((s) => s.station.isDemo)).toBe(false);
  }, 30_000);
});
