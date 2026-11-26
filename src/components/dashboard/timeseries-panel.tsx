"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Info, LineChart } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { TimeseriesChart } from "@/components/charts/timeseries-chart";
import { colorSlot, SERIES_VARS } from "@/components/charts/colors";
import { OriginTag, ProviderTag } from "@/components/dashboard/status";
import { RangePicker, rangeToQuery, type RangeValue } from "./range-picker";
import { SeriesInsights } from "./series-insights";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/fetcher";
import { formatDuration, formatValue, pct } from "@/lib/format";
import type { TimeseriesResult } from "@/lib/timeseries";
import type { ProviderType } from "@/lib/integrations/contracts";

export interface StationOption {
  id: string;
  name: string;
  provider: ProviderType;
  metrics: string[];
}
export interface MetricOption {
  key: string;
  label: string;
}

export function TimeseriesPanel({
  title = "Time series",
  description,
  stations,
  metrics,
  defaultMetric,
  defaultStationIds,
  defaultRange = { range: "24h" },
  lockStations = false,
  maxStations = 6,
  height = 340,
  showStats = true,
}: {
  title?: string;
  description?: string;
  stations: StationOption[];
  metrics: MetricOption[];
  defaultMetric?: string;
  defaultStationIds?: string[];
  defaultRange?: RangeValue;
  lockStations?: boolean;
  maxStations?: number;
  height?: number;
  showStats?: boolean;
}) {
  const [metric, setMetric] = useState(defaultMetric ?? metrics[0]?.key ?? "");
  const [range, setRange] = useState<RangeValue>(defaultRange);
  const eligible = useMemo(() => stations.filter((s) => s.metrics.includes(metric)), [stations, metric]);
  const [picked, setPicked] = useState<string[] | null>(defaultStationIds ?? null);
  const selected = (picked ?? eligible.map((s) => s.id)).filter((id) => eligible.some((s) => s.id === id)).slice(0, maxStations);

  const q = useQuery({
    queryKey: ["timeseries", metric, selected.join(","), rangeToQuery(range)],
    queryFn: ({ signal }) => apiGet<TimeseriesResult>(`/api/analytics/timeseries?metric=${encodeURIComponent(metric)}&stations=${encodeURIComponent(selected.join(","))}&${rangeToQuery(range)}`, { signal }),
    enabled: Boolean(metric) && selected.length > 0,
    refetchInterval: range.range === "custom" ? false : 60_000,
  });

  const data = q.data;
  const universe = useMemo(() => (data?.lines ?? []).map((l) => l.seriesId), [data]);
  const plotted = (data?.lines ?? []).filter((l) => !l.incompatible);
  const chartLines = plotted.map((l) => ({ id: l.seriesId, name: l.label, colorSlot: colorSlot(l.seriesId, universe), points: l.points }));
  const unit = plotted[0]?.unit ?? "";

  return (
    <Card aria-label={title} aria-busy={q.isFetching}>
      <CardHeader
        title={title}
        description={description}
        icon={<LineChart className="size-4" />}
        action={<RangePicker value={range} onChange={setRange} />}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-full flex-col gap-1 text-xs font-medium text-text-2 sm:w-auto">
            Measurement
            <Select value={metric} onChange={(e) => { setMetric(e.target.value); if (!lockStations) setPicked(null); }} className="w-full sm:min-w-52">
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </label>
          {!lockStations && eligible.length > 0 && (
            <fieldset className="flex w-full min-w-0 basis-full flex-col gap-1 sm:flex-1 sm:basis-0">
              <legend className="mb-1 text-xs font-medium text-text-2">Stations ({selected.length}/{Math.min(maxStations, eligible.length)})</legend>
              <div className="flex flex-wrap gap-1.5">
                {eligible.map((s) => {
                  const on = selected.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      aria-pressed={on}
                      disabled={!on && selected.length >= maxStations}
                      onClick={() => setPicked(on ? selected.filter((x) => x !== s.id) : [...selected, s.id].slice(0, maxStations))}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-accent/50 bg-accent-soft text-accent-text" : "border-border text-text-3 hover:text-text"}`}
                    >
                      <ProviderTag provider={s.provider} className="sr-only" />
                      <span aria-hidden className="size-1.5 rounded-full" style={{ background: `var(--provider-${s.provider.toLowerCase()})` }} />
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>

        {!eligible.length ? (
          <EmptyState icon={<Info />} title="No station reports this measurement">Only measurements actually returned by the providers can be charted.</EmptyState>
        ) : !selected.length ? (
          <EmptyState icon={<Info />} title="Select at least one station" />
        ) : q.isPending ? (
          <Skeleton className="w-full" />
        ) : q.isError ? (
          <EmptyState icon={<AlertCircle />} title="Could not load history">{(q.error as Error).message}<div className="mt-3"><Button size="sm" onClick={() => q.refetch()}>Retry history</Button></div></EmptyState>
        ) : (
          <>
            {plotted.some((l) => l.points.some((p) => p[1] !== null)) ? (
              <div className={q.isFetching ? "opacity-60 transition-opacity" : ""}>
                <TimeseriesChart lines={chartLines} unit={unit} kind={data!.metric.kind} decimals={data!.metric.decimals} height={height} start={data!.start} end={data!.end} yLabel={`${data!.metric.label}${unit ? ` (${unit})` : ""}`} />
              </div>
            ) : (
              <EmptyState icon={<Info />} title="No observations in this period">The provider returned no data for the selected range. This is shown as missing, not as zero.</EmptyState>
            )}
            <LineNotes data={data!} />
            {showStats && <SeriesInsights data={data!} />}
            {showStats && <StatsTable data={data!} universe={universe} />}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function LineNotes({ data }: { data: TimeseriesResult }) {
  const errors = data.lines.filter((l) => l.error);
  const incompatible = data.lines.filter((l) => l.incompatible);
  const notes = [...new Set(data.lines.flatMap((l) => l.notes))];
  const aggregated = data.lines.some((l) => l.aggregated);
  if (!errors.length && !incompatible.length && !notes.length && !aggregated) return null;
  return (
    <ul className="space-y-1 text-xs text-text-3">
      {errors.map((l) => (
        <li key={l.seriesId} className="flex gap-1.5 text-critical">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {l.stationName}: {l.error!.label} — {l.error!.message}
        </li>
      ))}
      {incompatible.map((l) => (
        <li key={l.seriesId} className="flex gap-1.5 text-warn">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {l.label} not plotted: {l.incompatible}
        </li>
      ))}
      {aggregated && (
        <li className="flex gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Dense series are resampled to {formatDuration(data.bucketMs / 60_000)} buckets using the metric-appropriate statistic ({data.metric.kind === "direction" ? "circular mean" : data.metric.kind === "interval_total" ? "sum" : data.metric.kind === "running_total" ? "last value" : "mean"}).
        </li>
      )}
      {notes.map((n) => (
        <li key={n} className="flex gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {n}
        </li>
      ))}
    </ul>
  );
}

function StatsTable({ data, universe }: { data: TimeseriesResult; universe: string[] }) {
  const m = data.metric;
  const d = m.decimals;
  return (
    <TableWrap>
      <Table aria-label={`${m.label} statistics (table view of the chart)`}>
        <thead>
          <tr>
            <Th>Series</Th>
            <Th>Source</Th>
            <Th className="text-right">{m.kind === "direction" ? "Circular mean" : "Mean"}</Th>
            <Th className="text-right">Min</Th>
            <Th className="text-right">Max</Th>
            {m.kind === "interval_total" && <Th className="text-right">Total</Th>}
            <Th className="text-right">Count</Th>
            <Th className="text-right">Interval</Th>
            <Th className="text-right">Completeness</Th>
            <Th className="text-right">Gaps</Th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.seriesId}>
              <Td className="max-w-80">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-1 w-3 shrink-0 rounded-full" style={{ background: `var(${SERIES_VARS[colorSlot(l.seriesId, universe)]})` }} />
                  <span className="truncate text-text">{l.label}</span>
                </div>
                {l.statistic && <span className="ml-5 text-[11px] text-text-3">logged as {l.statistic}</span>}
              </Td>
              <Td>
                <div className="flex flex-col gap-1">
                  <ProviderTag provider={l.provider} />
                  <OriginTag origin={l.origin} />
                </div>
              </Td>
              <Td className="tabular text-right text-text">{formatValue(l.stats.mean, d)} <span className="text-text-3">{l.unit}</span></Td>
              <Td className="tabular text-right">{formatValue(l.stats.min, d)}</Td>
              <Td className="tabular text-right">{formatValue(l.stats.max, d)}</Td>
              {m.kind === "interval_total" && <Td className="tabular text-right">{formatValue(l.stats.total, d)}</Td>}
              <Td className="tabular text-right">{l.stats.count}</Td>
              <Td className="tabular text-right">{formatDuration(l.intervalMinutes)}</Td>
              <Td className="tabular text-right">{pct(l.completeness)}</Td>
              <Td className="tabular text-right" title={l.gaps.slice(0, 5).map((g) => `${g.start} → ${g.end}`).join("\n")}>
                {l.gaps.length}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
