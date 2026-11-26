"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Info } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { DateTime, OriginTag, ProviderTag, QualityFlag } from "./status";
import { RangePicker, rangeToQuery, type RangeValue } from "./range-picker";
import { apiGet } from "@/lib/fetcher";
import { formatValue } from "@/lib/format";
import { getMetric } from "@/lib/metrics/registry";
import { PROVIDER_META, type ProviderType, type UnifiedObservation, type UnifiedSeries } from "@/lib/integrations/contracts";

interface ExplorerStation {
  id: string;
  name: string;
  provider: ProviderType;
  series: UnifiedSeries[];
}
interface RawPage {
  total: number;
  page: number;
  pageSize: number;
  resolution: string;
  truncated: boolean;
  notes: string[];
  rows: UnifiedObservation[];
}

export function ExplorerClient({ stations, initialStation }: { stations: ExplorerStation[]; initialStation?: string }) {
  const [stationId, setStationId] = useState(initialStation && stations.some((s) => s.id === initialStation) ? initialStation : stations[0]?.id ?? "");
  const station = stations.find((s) => s.id === stationId);
  const [seriesId, setSeriesId] = useState<string>("");
  const [range, setRange] = useState<RangeValue>({ range: "24h" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const series = station?.series ?? [];
  const sel = series.find((s) => s.id === seriesId);
  const params = `stationId=${encodeURIComponent(stationId)}${sel ? `&series=${encodeURIComponent(sel.id)}` : ""}&${rangeToQuery(range)}`;

  const q = useQuery({
    queryKey: ["raw", params, page, pageSize],
    queryFn: () => apiGet<RawPage>(`/api/observations/raw?${params}&page=${page}&pageSize=${pageSize}`),
    enabled: Boolean(stationId),
    placeholderData: (p) => p,
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-60 flex-col gap-1 text-xs font-medium text-text-2">
            Station / device
            <Select value={stationId} onChange={(e) => { setStationId(e.target.value); setSeriesId(""); setPage(1); }}>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {PROVIDER_META[s.provider].name}</option>
              ))}
            </Select>
          </label>
          <label className="flex min-w-60 flex-col gap-1 text-xs font-medium text-text-2">
            Sensor / measurement
            <Select value={seriesId} onChange={(e) => { setSeriesId(e.target.value); setPage(1); }}>
              <option value="">All measurements</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>{getMetric(s.metricKey, s.originalMetricName).label} — {s.originalMetricName}</option>
              ))}
            </Select>
          </label>
          <div className="flex flex-col gap-1 text-xs font-medium text-text-2">
            Period
            <RangePicker value={range} onChange={(r) => { setRange(r); setPage(1); }} />
          </div>
          <a href={`/api/observations/export?${params}`} className={buttonVariants({ variant: "primary", className: "ml-auto" })} download>
            <Download /> Export CSV
          </a>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Observations"
          description={q.data ? `${q.data.total.toLocaleString()} observations · provider resolution: ${q.data.resolution}` : "Loading…"}
        />
        {q.data?.notes.length ? (
          <ul className="space-y-0.5 border-b border-border px-5 py-2 text-xs text-text-3">
            {q.data.notes.map((n) => (
              <li key={n} className="flex gap-1.5"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {n}</li>
            ))}
          </ul>
        ) : null}
        {q.isPending ? (
          <CardBody><Skeleton className="h-64" /></CardBody>
        ) : q.isError ? (
          <CardBody><EmptyState title="Could not load observations">{(q.error as Error).message}</EmptyState></CardBody>
        ) : !q.data!.rows.length ? (
          <CardBody><EmptyState title="No observations in this period">The provider returned no data for the selection.</EmptyState></CardBody>
        ) : (
          <TableWrap className={q.isFetching ? "opacity-60" : ""}>
            <Table>
              <thead>
                <tr>
                  <Th>Observed</Th>
                  <Th>Measurement</Th>
                  <Th className="text-right">Value</Th>
                  <Th className="text-right">As reported</Th>
                  <Th>Source</Th>
                  <Th>Origin</Th>
                </tr>
              </thead>
              <tbody>
                {q.data!.rows.map((o) => {
                  const m = getMetric(o.metricKey, o.originalMetricName);
                  return (
                    <tr key={o.seriesId + o.observedAt}>
                      <Td><DateTime iso={o.observedAt} pattern="yyyy-MM-dd HH:mm:ss" className="text-text" /></Td>
                      <Td>
                        <p className="text-text">{m.label}</p>
                        <p className="font-mono text-[11px] text-text-3">{o.originalMetricName}</p>
                      </Td>
                      <Td className="tabular text-right text-text">
                        <span className="inline-flex items-center gap-1">{formatValue(o.value, m.decimals)} <span className="text-text-3">{o.unit}</span> <QualityFlag flag={o.qualityFlag} /></span>
                      </Td>
                      <Td className="tabular text-right text-xs">{String(o.originalValue ?? "—")} {o.originalUnit ?? ""}</Td>
                      <Td><ProviderTag provider={o.provider} /></Td>
                      <Td><OriginTag origin={o.origin} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
        {q.data && (
          <Pagination
            page={page}
            pageCount={pages}
            total={q.data.total}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(n) => { setPageSize(n); setPage(1); }}
            pageSizes={[25, 50, 100]}
            label="observations"
            className="border-t border-border px-5 py-2.5"
          />
        )}
      </Card>
    </div>
  );
}
