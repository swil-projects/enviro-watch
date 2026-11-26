import { describe, expect, it } from "vitest";
import { redactText, redactUrl } from "@/lib/redact";
import { csvCell, toCsv } from "@/lib/csv";
import { classifyFreshness } from "@/lib/freshness";
import { backoffDelay, parseRetryAfter } from "@/lib/http";

describe("secret redaction", () => {
  it("redacts credential query parameters", () => {
    const u = redactUrl("https://api.ecowitt.net/api/v3/device/real_time?application_key=AAA&api_key=BBB&mac=9C:13");
    expect(u).not.toContain("AAA");
    expect(u).not.toContain("BBB");
    expect(u).toContain("mac=9C%3A13");
    expect(redactUrl("https://obscape.com/portal/api/v3/api?username=u&key=SECRET")).not.toContain("SECRET");
  });
  it("redacts known secrets, bearer tokens and inline key params from text", () => {
    const t = redactText("failed: Bearer abc.def.ghi with key=XYZ and token MYTOKEN", ["MYTOKEN"]);
    expect(t).not.toMatch(/abc\.def|XYZ|MYTOKEN/);
  });
});

describe("CSV export", () => {
  it("escapes and neutralises formula injection", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(-3.2)).toBe("-3.2");
    expect(csvCell(null)).toBe("");
  });
  it("has a header row", () => {
    expect(toCsv([]).split("\r\n")[0]).toContain("observedAt,provider,stationId");
  });
});

describe("freshness", () => {
  it("classifies by age", () => {
    expect(classifyFreshness(10, 60)).toBe("live");
    expect(classifyFreshness(120, 60)).toBe("stale");
    expect(classifyFreshness(600, 60)).toBe("offline");
    expect(classifyFreshness(null, 60)).toBe("offline");
    expect(classifyFreshness(10, 60, true)).toBe("error");
  });
});

describe("retry helpers", () => {
  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(new Date(Date.now() + 10_000).toUTCString())).toBeGreaterThan(5000);
  });
  it("bounds exponential backoff with jitter", () => {
    for (let i = 0; i < 50; i++) {
      const d = backoffDelay(3, 500, 8000);
      expect(d).toBeGreaterThanOrEqual(2000);
      expect(d).toBeLessThanOrEqual(4000);
    }
    expect(backoffDelay(20, 500, 8000)).toBeLessThanOrEqual(8000);
  });
});
