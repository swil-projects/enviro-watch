"use client";

import { useState } from "react";
import { ChartNoAxesCombined, Download, Info, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { csvCell } from "@/lib/csv";
import { Select } from "@/components/ui/field";
import { formatValue, pct } from "@/lib/format";
import type { TimeseriesResult } from "@/lib/timeseries";

function downloadAnalysis(data: TimeseriesResult) {
  const columns = ["series", "provider", "metric", "unit", "start_inclusive", "end_exclusive", "samples", "mean", "median", "min", "max", "total", "p10", "p90", "sample_std_dev", "trend_per_hour", "r_squared", "completeness", "gaps", "quality_flags", "iqr_outliers", "truncated", "provider_error"];
  const rows = data.lines.map((l) => [l.label, l.provider, data.metric.key, l.unit, data.start, data.end, l.stats.count, l.stats.mean, l.stats.median, l.stats.min, l.stats.max, l.stats.total, l.insights.p10, l.insights.p90, l.insights.standardDeviation, l.insights.trend?.perHour, l.insights.trend?.rSquared, l.completeness, l.gaps.length, l.insights.flaggedCount, l.insights.outlierCount, l.truncated, l.error?.message]);
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `analysis_${data.metric.key.replace(/[^a-z0-9_-]/gi, "_")}_${data.start.slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Uses the same response as the chart: changing filters cannot desynchronize insights. */
export function SeriesInsights({ data }: { data: TimeseriesResult }) {
  const [seriesId, setSeriesId] = useState("");
  const available = data.lines.filter((line) => !line.incompatible && line.stats.count > 0);
  const line = available.find((item) => item.seriesId === seriesId) ?? available[0];
  if (!line) return null;
  const insight = line.insights;
  const d = data.metric.decimals;
  const scalar = data.metric.kind === "instantaneous" || data.metric.kind === "rate";
  const span = (line.stats.max ?? 0) - (line.stats.min ?? 0);
  const position = (value: number | null) => span > 0 && value !== null ? Math.max(0, Math.min(100, ((value - line.stats.min!) / span) * 100)) : 50;
  const attention = line.truncated || line.error || insight.flaggedCount > 0 || (line.completeness !== null && line.completeness < 0.8);

  return (
    <section aria-label="Series insights" className="overflow-hidden rounded-xl border border-border bg-surface-2/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ChartNoAxesCombined className="size-4 text-accent-text" aria-hidden />Series insights</h3>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto"><Select aria-label="Insight series" value={line.seriesId} onChange={(event) => setSeriesId(event.target.value)} className="w-full sm:max-w-80">
          {available.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.label}</option>)}
        </Select><Button size="sm" onClick={() => downloadAnalysis(data)}><Download aria-hidden />Export analysis</Button></div>
      </div>
      <div className="grid gap-5 p-4 md:grid-cols-3">
        <div>
          <p className="text-xs text-text-3">{scalar ? "Typical range · P10–P90" : "Latest observed value"}</p>
          <p className="tabular mt-1 text-xl font-semibold tracking-tight">{scalar ? `${formatValue(insight.p10, d)} – ${formatValue(insight.p90, d)}` : formatValue(insight.latest, d)} <span className="text-xs font-normal text-text-3">{line.unit}</span></p>
          {scalar && <>
            <div className="relative my-3 h-2 rounded-full bg-border-strong" aria-hidden>
              <div className="absolute h-2 rounded-full bg-accent/60" style={{ left: `${position(insight.p10)}%`, width: `${Math.max(1, position(insight.p90) - position(insight.p10))}%` }} />
              <span className="absolute -top-1 h-4 w-0.5 bg-text" style={{ left: `${position(line.stats.median)}%` }} />
            </div>
            <p className="text-xs text-text-3">Median {formatValue(line.stats.median, d)} · sample σ {formatValue(insight.standardDeviation, d)}</p>
          </>}
          {!scalar && <p className="mt-2 text-xs text-text-3">{data.metric.kind === "direction" ? "Circular mean" : data.metric.kind === "interval_total" ? "Period total" : "Arithmetic trends do not apply to this measurement."}{["direction", "interval_total"].includes(data.metric.kind) ? ` ${formatValue(data.metric.kind === "direction" ? line.stats.mean : line.stats.total, d)} ${line.unit}` : ""}</p>}
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs text-text-3"><TrendingUp className="size-3.5" aria-hidden />Observed trend</p>
          <p className="tabular mt-1 text-xl font-semibold tracking-tight">{insight.trend ? `${insight.trend.perHour > 0 ? "+" : ""}${formatValue(insight.trend.perHour, Math.max(d, 2))}` : "—"} {insight.trend && <span className="text-xs font-normal text-text-3">{line.unit}/h</span>}</p>
          <p className="mt-2 text-xs leading-relaxed text-text-3">{insight.trend ? `Linear fit R² ${formatValue(insight.trend.rSquared, 2)}. Describes this window; not a forecast.` : scalar ? "At least three samples at different times are needed." : "Trend fitting is available for instantaneous values and rates."}</p>
        </div>
        <div>
          <p className="text-xs text-text-3">History coverage</p>
          <p className="tabular mt-1 text-xl font-semibold tracking-tight">{pct(line.completeness)} <span className="text-xs font-normal text-text-3">{line.stats.count.toLocaleString()} samples</span></p>
          <p className="mt-2 text-xs leading-relaxed text-text-3">{line.gaps.length} gaps · {insight.flaggedCount} quality flags{insight.outlierCount !== null ? ` · ${insight.outlierCount} statistical outliers` : ""}</p>
        </div>
      </div>
      <p className={`flex items-start gap-2 border-t border-border px-4 py-2.5 text-xs leading-relaxed ${attention ? "bg-warn-soft text-warn" : "text-text-3"}`}>
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {attention ? "Interpret with care: this series has incomplete history, quality flags, or a provider error. " : ""}
        {line.truncated ? "The provider truncated this history. " : ""}
        {scalar ? "Range and fit use all valid returned samples, including flagged values. Outliers use 1.5× IQR with at least 8 samples; they are not safety alerts." : "Statistics respect the measurement type. Missing samples remain missing."}
        {line.completeness === null ? " Coverage is unknown because the reporting interval cannot be estimated." : " Coverage estimates sample availability, not sensor accuracy."}
      </p>
    </section>
  );
}
