"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, GitCompareArrows, Minus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { ProviderTag } from "./status";
import { apiGet } from "@/lib/fetcher";
import { formatValue, pct } from "@/lib/format";
import type { MetricOption } from "./timeseries-panel";
import type { Stats } from "@/lib/analytics";
import type { MetricDefinition } from "@/lib/metrics/registry";
import type { ProviderType } from "@/lib/integrations/contracts";

interface Summary {
  metric: MetricDefinition;
  start: string;
  end: string;
  lines: { warnings: string[]; previousCompleteness: number | null; seriesId: string; label: string; provider: ProviderType; unit: string; current: Stats; previous: Stats | null; change: { current: number; previous: number; delta: number; basis: string } | null; completeness: number | null; gaps: number }[];
}

/** Period-over-period: the selected window vs the equal-length window immediately before it. */
export function PeriodComparison({ metrics, defaultMetric }: { metrics: MetricOption[]; defaultMetric?: string }) {
  const [metric, setMetric] = useState(defaultMetric ?? metrics[0]?.key ?? "");
  const [range, setRange] = useState("24h");
  const q = useQuery({ queryKey: ["summary", metric, range], queryFn: () => apiGet<Summary>(`/api/analytics/summary?metric=${encodeURIComponent(metric)}&range=${range}`), enabled: Boolean(metric) });
  const representative = (stats: Stats | null) => !stats ? null : q.data?.metric.kind === "interval_total" ? stats.total : ["instantaneous", "rate", "direction"].includes(q.data?.metric.kind ?? "") ? stats.mean : null;
  const d = q.data?.metric.decimals ?? 1;
  const pg = usePagination(q.data?.lines ?? [], 10);
  return (
    <Card>
      <CardHeader
        title="Period-over-period"
        description="Selected window compared with the preceding window of equal length. Uses mean for instantaneous metrics and total for per-interval amounts; counters and directions are not compared this way."
        icon={<GitCompareArrows className="size-4" />}
        action={
          <div className="flex max-w-full flex-wrap gap-2">
            <Select aria-label="Measurement" value={metric} onChange={(e) => setMetric(e.target.value)} className="max-w-56">
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Window" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="24h">24 h vs previous 24 h</option>
              <option value="7d">7 d vs previous 7 d</option>
              <option value="6h">6 h vs previous 6 h</option>
            </Select>
          </div>
        }
      />
      <CardBody>
        {q.isPending ? (
          <Skeleton className="h-32" />
        ) : q.isError ? (
          <p className="text-sm text-critical">{(q.error as Error).message}</p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Series</Th>
                  <Th className="text-right">Current</Th>
                  <Th className="text-right">Previous</Th>
                  <Th className="text-right">Change</Th>
                  <Th className="text-right">Min / Max (current)</Th>
                  <Th className="text-right">Coverage now / previous</Th>
                </tr>
              </thead>
              <tbody>
                {pg.pageItems.map((l) => (
                  <tr key={l.seriesId}>
                    <Td>
                      <p className="text-text">{l.label}</p>
                      <ProviderTag provider={l.provider} />
                      {l.warnings.length > 0 && <p className="mt-1 max-w-72 text-xs text-warn">{l.warnings.join(". ")}</p>}
                    </Td>
                    <Td className="tabular text-right text-text">{`${formatValue(representative(l.current), d)} ${l.unit}`}</Td>
                    <Td className="tabular text-right">{`${formatValue(representative(l.previous), d)} ${l.unit}`}</Td>
                    <Td className="tabular text-right">
                      {l.change ? (
                        <span className="inline-flex items-center gap-1 text-text">
                          {l.change.delta > 0 ? <ArrowUpRight className="size-3.5" aria-label="increase" /> : l.change.delta < 0 ? <ArrowDownRight className="size-3.5" aria-label="decrease" /> : <Minus className="size-3.5" aria-label="no change" />}
                          {formatValue(l.change.delta, d)} {l.unit}
                          <span className="text-[10px] text-text-3">({l.change.basis})</span>
                        </span>
                      ) : (
                        <span className="text-text-3" title="Not comparable for this metric type or no data in one of the windows">n/a</span>
                      )}
                    </Td>
                    <Td className="tabular text-right">
                      {formatValue(l.current.min, d)} / {formatValue(l.current.max, d)}
                    </Td>
                    <Td className="tabular text-right">{pct(l.completeness)} / {pct(l.previousCompleteness)}</Td>
                  </tr>
                ))}
                {!q.data!.lines.length && (
                  <tr>
                    <Td colSpan={6} className="py-6 text-center text-text-3">No station reports this measurement.</Td>
                  </tr>
                )}
              </tbody>
            </Table>
            <Pagination {...pg} onPage={pg.setPage} onPageSize={pg.setPageSize} label="series" className="pt-3" />
          </TableWrap>
        )}
      </CardBody>
    </Card>
  );
}
