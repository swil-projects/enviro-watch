import Link from "next/link";
import { BookOpen, CheckCircle2, CircleHelp, Cpu, FolderKanban, TriangleAlert, XCircle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Td, Th } from "@/components/ui/table";
import { PaginatedGrid, PaginatedTable } from "@/components/ui/pagination";
import { Kpi } from "./kpi";
import { ProviderStatusBadge, ProviderTag, TimeAgo } from "./status";
import { StationsTable } from "./stations-table";
import { TimeseriesPanel } from "./timeseries-panel";
import { StationLiveCard } from "./live-client";
import { getUnifiedSnapshot } from "@/lib/service";
import { providerSummaries, toStationRow } from "@/lib/overview";
import { metricOptions, stationOptions } from "@/lib/page-data";
import { PROVIDER_META, type CapabilityStatus, type ProviderType } from "@/lib/integrations/contracts";
import { getMetric } from "@/lib/metrics/registry";

const CAP_ICON: Record<CapabilityStatus, React.ReactNode> = {
  supported: <CheckCircle2 className="size-4 text-good" aria-label="supported" />,
  unverified: <CircleHelp className="size-4 text-warn" aria-label="unverified" />,
  unsupported: <XCircle className="size-4 text-text-3" aria-label="not supported" />,
};

/** Provider-specific dashboard. Shared layout, provider-specific emphasis via `intro`. */
export async function ProviderPage({ provider, intro }: { provider: ProviderType; intro: React.ReactNode }) {
  const snap = await getUnifiedSnapshot();
  const summary = providerSummaries(snap).find((p) => p.provider === provider)!;
  const views = snap.stations.filter((s) => s.station.provider === provider);
  const opts = stationOptions(snap, (s) => s.station.provider === provider);
  const metrics = metricOptions(snap, opts);
  const projects = [...new Set(views.map((v) => v.station.projectName).filter(Boolean))] as string[];
  const meta = PROVIDER_META[provider];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ProviderTag provider={provider} className="text-base font-semibold text-text" />
        <ProviderStatusBadge status={summary.status} />
        {summary.isDemo && <span className="text-xs font-semibold uppercase text-serious">Demo data</span>}
        <span className="text-xs text-text-3">
          Retrieved <TimeAgo iso={summary.fetchedAt} /> · {summary.durationMs} ms
        </span>
        <Link href="/integrations" className="ml-auto text-xs text-accent-text hover:underline">Integration health →</Link>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={provider === "OBSCAPE" ? "Projects" : "Configured devices"} value={provider === "OBSCAPE" ? projects.length : summary.configuredDeviceCount} />
        <Kpi label="Discovered" value={summary.discoveredCount} sub={provider === "LICOR" ? "loggers" : "stations / devices"} />
        <Kpi label="Reporting" value={summary.reportingCount} />
        <Kpi label="Measurement series" value={views.reduce((n, v) => n + v.series.length, 0)} sub={`${metrics.length} distinct metrics`} />
        <Kpi label="Last observation" value={<TimeAgo iso={summary.lastObservationAt} className="text-xl" />} />
      </section>

      {(summary.errors.length > 0 || summary.warnings.length > 0) && (
        <Card>
          <CardBody className="space-y-2">
            {summary.errors.map((e, i) => (
              <p key={i} className="flex gap-2 rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span><strong>{e.label}.</strong> {e.message}</span>
              </p>
            ))}
            {summary.warnings.map((w, i) => (
              <p key={i} className="flex gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
              </p>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`About this integration`} icon={<BookOpen className="size-4" />} />
          <CardBody className="space-y-3 text-sm text-text-2">
            {intro}
            <ul className="space-y-1.5 text-xs text-text-3">
              {summary.capabilities.notes.map((n) => (
                <li key={n} className="list-inside list-disc">{n}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Capabilities" />
          <CardBody className="space-y-2 text-sm">
            {(["discovery", "latest", "history"] as const).map((c) => (
              <p key={c} className="flex items-center justify-between">
                <span className="capitalize text-text-2">{c === "latest" ? "Current readings" : c === "history" ? "Provider history" : "Automatic discovery"}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-text-3">
                  {CAP_ICON[summary.capabilities[c]]} {summary.capabilities[c]}
                </span>
              </p>
            ))}
          </CardBody>
        </Card>
      </div>

      {provider === "OBSCAPE" && projects.length > 0 && (
        <Card>
          <CardHeader title="Projects" icon={<FolderKanban className="size-4" />} />
          <CardBody className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <span key={p} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm">
                {p} <span className="text-text-3">· {views.filter((v) => v.station.projectName === p).length} stations</span>
              </span>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title={`${meta.name} inventory`} icon={<Cpu className="size-4" />} />
        <CardBody>
          {views.length ? <StationsTable rows={views.map(toStationRow)} lockProvider /> : <EmptyState title="No stations from this provider">{summary.configured ? "The provider responded but no stations/devices were recognised." : "Credentials are not configured."}</EmptyState>}
        </CardBody>
      </Card>

      {views.length > 0 && (
        <PaginatedGrid className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3" items={views.map((v) => <StationLiveCard key={v.station.id} s={v} />)} pageSize={6} label="stations" />
      )}

      {metrics.length > 0 && <TimeseriesPanel title={`${meta.name} history`} description={opts.length > 1 ? "Compare compatible measurements across this provider's stations." : undefined} stations={opts} metrics={metrics} />}

      {views.length > 0 && (
        <Card>
          <CardHeader title="Available parameters" description="Every parameter returned by the API, with the provider's identifiers and units preserved." />
          <PaginatedTable
            label="parameters"
            pageSize={15}
            caption="Available parameters"
            head={
              <tr>
                <Th>Station</Th>
                <Th>Provider parameter</Th>
                <Th>Normalized metric</Th>
                <Th>Reported unit</Th>
                <Th>Canonical unit</Th>
              </tr>
            }
            rows={views.flatMap((v) =>
              v.series.map((s) => (
                <tr key={s.id}>
                  <Td className="text-text">{v.station.name}</Td>
                  <Td className="font-mono text-xs">{s.sourceKey}</Td>
                  <Td>{getMetric(s.metricKey, s.originalMetricName).label}</Td>
                  <Td>{s.originalUnit || "—"}</Td>
                  <Td>{s.unit || "—"}</Td>
                </tr>
              )),
            )}
          />
        </Card>
      )}
    </div>
  );
}
