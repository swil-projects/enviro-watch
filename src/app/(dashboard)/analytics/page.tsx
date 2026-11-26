import { Suspense } from "react";
import { Scale } from "lucide-react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TimeseriesPanel } from "@/components/dashboard/timeseries-panel";
import { PeriodComparison } from "@/components/dashboard/period-comparison";
import { Kpi } from "@/components/dashboard/kpi";
import { requireUser } from "@/lib/auth/session";
import { getUnifiedSnapshot } from "@/lib/service";
import { metricOptions, stationOptions } from "@/lib/page-data";
import { getMetric } from "@/lib/metrics/registry";

export const metadata = { title: "Environmental Analytics" };

async function Content() {
  await requireUser();
  const snap = await getUnifiedSnapshot();
  const stations = stationOptions(snap);
  const metrics = metricOptions(snap, stations);
  // Prefer a metric reported by more than one provider for the default comparison.
  const byMetric = new Map<string, Set<string>>();
  for (const s of stations) for (const m of s.metrics) byMetric.set(m, (byMetric.get(m) ?? new Set()).add(s.provider));
  const crossProvider = [...byMetric.entries()].filter(([k, p]) => p.size > 1 && !k.includes(":")).sort((a, b) => (getMetric(a[0]).headline ?? 99) - (getMetric(b[0]).headline ?? 99));
  const defaultMetric = crossProvider[0]?.[0] ?? metrics[0]?.key;
  const total = snap.stations.length || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-2">
        <div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Understand what’s changing.</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-2">Explore sensor history, compare conditions and assess the quality of the evidence behind each trend.</p></div>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-2">{snap.isDemo ? "Synthetic demo data" : "Provider history"}</span>
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Comparable metrics across providers" value={crossProvider.length} sub={crossProvider.slice(0, 3).map(([k]) => getMetric(k).shortLabel ?? getMetric(k).label).join(", ") || "none yet"} />
        <Kpi label="Distinct measurements" value={metrics.length} sub="normalized metric keys" />
        <Kpi label="Stations reporting" value={`${Math.round((snap.stations.filter((s) => s.freshness === "live").length / total) * 100)}%`} sub="within freshness window" />
        <Kpi label="Current readings" value={snap.stations.reduce((n, s) => n + s.latest.length, 0)} sub="latest values held in memory" />
      </section>

      {metrics.length ? (
        <>
          <TimeseriesPanel title="Cross-station comparison" description="Only series with the same normalized metric are compared, on one axis in canonical units. Dense series are resampled with metric-appropriate statistics." stations={stations} metrics={metrics} defaultMetric={defaultMetric} maxStations={8} defaultRange={{ range: "7d" }} />
          <PeriodComparison metrics={metrics} defaultMetric={defaultMetric} />
        </>
      ) : null}

      <Card>
        <CardHeader title="Comparability & alignment rules" icon={<Scale className="size-4" />} />
        <CardBody className="grid gap-4 text-sm text-text-2 md:grid-cols-2">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>Series are compared only when they share a normalized metric key — e.g. relative (sea-level) and absolute (station) pressure are separate, as are wave and wind direction, rain rate and accumulated rain.</li>
            <li>Values are converted to canonical units (°C, hPa, m/s, mm, m, W/m²). The provider&apos;s original value and unit are preserved and shown on every reading.</li>
            <li>Co-located stations are never assumed interchangeable: each line keeps its provider, station and sensor identity.</li>
          </ul>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>Different reporting intervals are aligned by resampling onto a common grid sized to the window (≤ 500 buckets): mean for instantaneous values, circular mean for directions, sum for per-interval totals, last value for running counters.</li>
            <li>Gaps are detected when spacing exceeds 2.5× the series&apos; typical interval; completeness = observed ÷ expected samples.</li>
            <li>Missing data is never filled with zeros or interpolated; charts break the line instead.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
