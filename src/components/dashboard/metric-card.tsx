"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Sparkline } from "@/components/charts/sparkline";
import { FreshnessBadge, ProviderTag, QualityFlag, TimeAgo } from "./status";
import { apiGet } from "@/lib/fetcher";
import { formatValue } from "@/lib/format";
import type { HeadlineMetric } from "@/lib/overview";
import type { TimeseriesResult } from "@/lib/timeseries";

/** Headline metric: value, unit, station, provider, observation time, freshness and a 24 h trend (when history exists). */
export function MetricCard({ m }: { m: HeadlineMetric }) {
  const r = m.readings[0];
  const spark = useQuery({
    queryKey: ["spark", r.seriesId],
    queryFn: () => apiGet<TimeseriesResult>(`/api/analytics/timeseries?metric=${encodeURIComponent(m.metricKey)}&stations=${encodeURIComponent(r.stationId)}&series=${encodeURIComponent(r.seriesId)}&range=24h&maxPoints=60`),
    staleTime: 5 * 60_000,
  });
  const line = spark.data?.lines.find((l) => l.seriesId === r.seriesId);
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-text-3">{m.label}</p>
        <FreshnessBadge value={r.freshness} />
      </div>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="tabular text-2xl font-semibold tracking-tight">{formatValue(r.value, m.decimals)}</span>
        <span className="text-sm text-text-3">{m.unit}</span>
        <QualityFlag flag={r.qualityFlag} />
      </p>
      <div className="mt-2 h-8">{line && line.stats.count > 2 ? <Sparkline points={line.points} color="var(--accent)" /> : null}</div>
      <div className="mt-2 space-y-0.5 text-xs">
        <Link href={`/stations/${encodeURIComponent(r.stationId)}`} className="block truncate text-text-2 hover:text-text hover:underline">
          {r.stationName}
        </Link>
        <div className="flex items-center justify-between gap-2 text-text-3">
          <ProviderTag provider={r.provider} />
          <TimeAgo iso={r.observedAt} />
        </div>
      </div>
      {m.readings.length > 1 && <p className="mt-2 border-t border-border pt-2 text-[11px] text-text-3">+{m.readings.length - 1} other station{m.readings.length > 2 ? "s" : ""} report this</p>}
    </div>
  );
}
