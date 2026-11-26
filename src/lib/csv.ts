import type { UnifiedObservation } from "./integrations/contracts";

const COLUMNS: (keyof UnifiedObservation)[] = [
  "observedAt",
  "provider",
  "stationId",
  "seriesId",
  "sensorId",
  "metricKey",
  "originalMetricName",
  "value",
  "unit",
  "originalValue",
  "originalUnit",
  "origin",
  "qualityFlag",
  "retrievedAt",
];

/** RFC 4180 escaping, plus neutralising spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: UnifiedObservation[]): string {
  const lines = [COLUMNS.join(",")];
  for (const r of rows) lines.push(COLUMNS.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}
