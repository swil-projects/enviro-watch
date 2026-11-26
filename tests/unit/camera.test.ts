import { describe, expect, it } from "vitest";
import { cameraDevice, cameraImageUrl, parseFrameParam, sniffImageType } from "@/lib/camera";
import { parseCameraFrames } from "@/lib/integrations/obscape/adapter";

type Station = Parameters<typeof cameraDevice>[0];
const station = (over: Partial<Station> = {}): Station => ({
  provider: "OBSCAPE",
  isDemo: false,
  metadata: { devices: { camera: { serial: "PTM6815", online: true } } },
  ...over,
} as Station);

describe("cameraDevice", () => {
  it("detects an Obscape camera device", () => {
    expect(cameraDevice(station())).toEqual({ serial: "PTM6815", online: true });
  });
  it("is null for stations without a camera, other providers and demo data", () => {
    expect(cameraDevice(station({ metadata: { devices: { weather: {} } } } as Partial<Station>))).toBeNull();
    expect(cameraDevice(station({ metadata: {} } as Partial<Station>))).toBeNull();
    expect(cameraDevice(station({ provider: "ECOWITT" } as Partial<Station>))).toBeNull();
    expect(cameraDevice(station({ isDemo: true }))).toBeNull();
  });
  it("tolerates missing serial / online", () => {
    expect(cameraDevice(station({ metadata: { devices: { camera: {} } } } as Partial<Station>))).toEqual({ serial: null, online: null });
  });
});

describe("parseFrameParam", () => {
  it("accepts latest / empty / unix seconds", () => {
    expect(parseFrameParam("latest")).toBe("latest");
    expect(parseFrameParam(null)).toBe("latest");
    expect(parseFrameParam("")).toBe("latest");
    expect(parseFrameParam("1795032000")).toBe(1795032000);
  });
  it("rejects anything that could alter the provider URL", () => {
    for (const bad of ["abc", "-1", "1.5", "17950320000000", "123", "1795032000&device=x", "1795032000 ", "0x10"]) {
      expect(parseFrameParam(bad)).toBeNull();
    }
  });
});

describe("cameraImageUrl", () => {
  it("encodes the station id and flags downloads", () => {
    expect(cameraImageUrl("obscape~p-1", 1795032000)).toBe("/api/stations/obscape~p-1/camera/image?t=1795032000");
    expect(cameraImageUrl("a/b c", "latest", { download: true })).toBe("/api/stations/a%2Fb%20c/camera/image?t=latest&download=1");
  });
});

describe("sniffImageType", () => {
  it("recognises JPEG and PNG and rejects everything else", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("[]"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("parseCameraFrames", () => {
  it("returns unique, ascending frames and ignores rows without a valid time", () => {
    const body = { data: [{ time: 1795032000 }, { time: 1795017600 }, { time: 1795032000 }, { time: "x" }, { time: 0 }, {}] } as unknown as Parameters<typeof parseCameraFrames>[0];
    expect(parseCameraFrames(body)).toEqual([
      { t: 1795017600, at: new Date(1795017600 * 1000).toISOString() },
      { t: 1795032000, at: new Date(1795032000 * 1000).toISOString() },
    ]);
  });
  it("handles an empty data set", () => {
    expect(parseCameraFrames({ data: [] } as unknown as Parameters<typeof parseCameraFrames>[0])).toEqual([]);
  });
});
