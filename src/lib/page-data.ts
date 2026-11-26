import "server-only";
import { CATEGORY_LABEL, getMetric } from "./metrics/registry";
import type { UnifiedSnapshot } from "./service";
import type { MetricOption, StationOption } from "@/components/dashboard/timeseries-panel";

export function stationOptions(snap: UnifiedSnapshot, filter?: (s: UnifiedSnapshot["stations"][number]) => boolean): StationOption[] {
  return snap.stations
    .filter((s) => (filter ? filter(s) : true))
    .map((s) => ({ id: s.station.id, name: s.station.name, provider: s.station.provider, metrics: [...new Set(s.series.map((x) => x.metricKey))] }));
}

const CAT_ORDER = Object.keys(CATEGORY_LABEL);
export function metricOptions(snap: UnifiedSnapshot, stations?: StationOption[]): MetricOption[] {
  const keys = new Set((stations ?? stationOptions(snap)).flatMap((s) => s.metrics));
  return [...keys]
    .map((k) => getMetric(k))
    .sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || (a.headline ?? 99) - (b.headline ?? 99) || a.label.localeCompare(b.label))
    .map((m) => ({ key: m.key, label: `${m.label}${m.key.includes(":") ? " (provider-specific)" : ""}` }));
}
