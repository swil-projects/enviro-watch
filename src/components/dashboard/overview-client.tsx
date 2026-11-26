"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { NetworkPulse } from "./network-pulse";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, Cpu, Plug, Radio, WifiOff } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Kpi } from "./kpi";
import { PaginatedGrid, Pagination, usePagination } from "@/components/ui/pagination";
import { ProviderCard } from "./provider-card";
import { MetricCard } from "./metric-card";
import { AlertList } from "./alert-list";
import { FreshnessBadge, ProviderTag, TimeAgo } from "./status";
import { TimeseriesPanel, type MetricOption, type StationOption } from "./timeseries-panel";
import { apiGet } from "@/lib/fetcher";
import type { Overview } from "@/lib/overview";

export function OverviewClient({ initial, stations, metrics }: { initial: Overview; stations: StationOption[]; metrics: MetricOption[] }) {
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ["overview"],
    queryFn: ({ signal }) => apiGet<Overview>("/api/dashboard/overview", { signal }),
    initialData: initial,
    refetchInterval: initial.refreshIntervalSeconds * 1000,
  });
  const k = data.kpis;
  const stationPg = usePagination(data.stations, 6);
  const defaultMetric = data.headline[0]?.metricKey ?? metrics[0]?.key;

  return (
    <div className="space-y-6">
      {isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn"><p>Refresh failed. Showing the last available snapshot; readings may be out of date.</p><Button size="sm" disabled={isFetching} onClick={() => refetch()}>Retry refresh</Button></div>}
      <NetworkPulse data={data} />
      <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Providers connected" value={`${k.providersConnected}/${k.providersTotal}`} sub={`${k.providersConfigured} configured`} icon={<Plug />} tone={k.providersConfigured > 0 && k.providersConnected === k.providersConfigured ? "good" : "warn"} />
        <Kpi label="Stations & devices" value={k.stations} sub="discovered across providers" icon={<Cpu />} />
        <Kpi label="Reporting" value={k.reporting} sub={`within freshness window`} icon={<Radio />} tone={k.reporting ? "good" : "neutral"} />
        <Kpi label="Stale / offline" value={`${k.stale} / ${k.offline}`} sub="needs attention" icon={<WifiOff />} tone={k.stale + k.offline ? "warn" : "neutral"} />
        <Kpi label="Active alerts" value={k.activeAlerts} sub={`${k.criticalAlerts} critical`} icon={<AlertTriangle />} tone={k.criticalAlerts ? "critical" : k.activeAlerts ? "warn" : "neutral"} />
        <Kpi label="Last successful sync" value={<TimeAgo iso={k.lastSuccessAt} className="text-xl" />} sub={`${k.liveReadings} current readings`} icon={<Activity />} />
      </section>

      <section aria-label="Providers" className="grid gap-3 md:grid-cols-3">
        {data.providers.map((p) => (
          <ProviderCard key={p.provider} p={p} />
        ))}
      </section>

      <section aria-labelledby="conditions-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="conditions-h" className="text-sm font-semibold">Current conditions</h2>
          <Link href="/live" className="text-xs text-accent-text hover:underline">Live monitoring →</Link>
        </div>
        {data.headline.length ? (
          <PaginatedGrid
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
            items={data.headline.map((m) => <MetricCard key={m.metricKey} m={m} />)}
            pageSize={6}
            label="measurements"
          />
        ) : (
          <EmptyState title="No current readings">No provider returned observations yet. Check Integration Health for connection details.</EmptyState>
        )}
      </section>

      {metrics.length > 0 && (
        <TimeseriesPanel title="Environmental trends" description="Provider history for the selected measurement; compatible stations share one axis." stations={stations} metrics={metrics} defaultMetric={defaultMetric} maxStations={4} showStats={false} />
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Active alerts" action={<Link href="/alerts" className="text-xs text-accent-text hover:underline">All alerts →</Link>} />
          <CardBody className="py-1">
            <AlertList alerts={data.alerts} />
          </CardBody>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Station status" action={<Link href="/stations" className="text-xs text-accent-text hover:underline">Inventory →</Link>} />
          <CardBody className="py-1">
            <ul className="divide-y divide-border">
              {stationPg.pageItems.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/stations/${encodeURIComponent(s.id)}`} className="block truncate text-sm font-medium hover:underline">
                      {s.name}
                    </Link>
                    <ProviderTag provider={s.provider} />
                  </div>
                  <span className="hidden text-xs text-text-3 sm:block">{s.seriesCount} measurements</span>
                  <TimeAgo iso={s.lastSeenAt} className="w-24 text-right text-xs text-text-3" />
                  <FreshnessBadge value={s.freshness} />
                </li>
              ))}
              {!data.stations.length && <li className="py-6 text-center text-sm text-text-3">No stations discovered yet.</li>}
            </ul>
            <Pagination {...stationPg} onPage={stationPg.setPage} label="stations" compact className="border-t border-border py-2.5" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
