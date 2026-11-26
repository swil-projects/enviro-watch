import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Database, Info, ListTree, MapPin, Stethoscope } from "lucide-react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Td, Th } from "@/components/ui/table";
import { PaginatedTable } from "@/components/ui/pagination";
import { StationLiveCard } from "@/components/dashboard/live-client";
import { CameraViewer } from "@/components/dashboard/camera-viewer";
import { cameraDevice } from "@/lib/camera";
import { TimeseriesPanel } from "@/components/dashboard/timeseries-panel";
import { FreshnessBadge, ProviderTag, TimeAgo } from "@/components/dashboard/status";
import { requireUser } from "@/lib/auth/session";
import { getStation, getUnifiedSnapshot } from "@/lib/service";
import { metricOptions, stationOptions } from "@/lib/page-data";
import { getMetric } from "@/lib/metrics/registry";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Station detail" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-0">
      <dt className="text-text-3">{k}</dt>
      <dd className="min-w-0 text-right text-text">{v}</dd>
    </div>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = decodeURIComponent((await params).id);
  const st = await getStation(id);
  if (!st) notFound();
  const { view, provider } = st;
  const s = view.station;
  const snap = await getUnifiedSnapshot();
  const opts = stationOptions(snap, (x) => x.station.id === id);
  const metrics = metricOptions(snap, opts);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text-3">
            <Link href="/stations" className="hover:underline">Stations</Link> / {s.externalId}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{s.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-text-3">
            <ProviderTag provider={s.provider} />
            <FreshnessBadge value={view.freshness} />
            <span>
              Last observation <TimeAgo iso={s.lastSeenAt} className="text-text-2" />
            </span>
          </div>
        </div>
        <Link href={`/explorer?station=${encodeURIComponent(s.id)}`} className={buttonVariants({ size: "sm" })}>
          <Database /> Explore & export data
        </Link>
      </div>

      {cameraDevice(s) && <CameraViewer stationId={s.id} stationName={s.name} />}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <StationLiveCard s={view} />
        </div>
        <Card>
          <CardHeader title="Identity" icon={<Info className="size-4" />} />
          <CardBody className="py-2">
            <dl>
              <Row k="Provider" v={<ProviderTag provider={s.provider} />} />
              <Row k="External ID" v={<code className="font-mono text-xs">{s.externalId}</code>} />
              <Row k="Project / site" v={s.projectName ?? "—"} />
              <Row
                k="Location"
                v={
                  s.latitude != null && s.longitude != null ? (
                    <Link href={`/map?station=${encodeURIComponent(s.id)}`} className="tabular inline-flex items-center gap-1 hover:underline">
                      <MapPin className="size-3" /> {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                    </Link>
                  ) : (
                    <span className="text-text-3">not provided by API</span>
                  )
                }
              />
              <Row k="Device time zone" v={s.timezone ?? "—"} />
              <Row k="Provider status" v={s.providerStatus ?? "—"} />
              <Row k="Sensors" v={view.sensors.length} />
              <Row k="Measurement series" v={view.series.length} />
            </dl>
          </CardBody>
        </Card>
      </div>

      {metrics.length > 0 && <TimeseriesPanel title="History" description="Provider historical data for this station." stations={opts} metrics={metrics} defaultStationIds={[s.id]} lockStations />}

      <Card>
        <CardHeader title="Measurement series" description="How each provider field maps into the unified model. Original names and units are preserved." icon={<ListTree className="size-4" />} />
        <PaginatedTable
          label="series"
          pageSize={10}
          caption="Measurement series"
          head={
            <tr>
              <Th>Provider field</Th>
              <Th>Normalized metric</Th>
              <Th>Unit (canonical)</Th>
              <Th>Unit (reported)</Th>
              <Th>Statistic</Th>
              <Th>Sensor</Th>
            </tr>
          }
          rows={view.series.map((x) => (
            <tr key={x.id}>
              <Td>
                <code className="font-mono text-xs text-text">{x.sourceKey}</code>
                <p className="text-[11px] text-text-3">{x.originalMetricName}</p>
              </Td>
              <Td>
                {getMetric(x.metricKey, x.originalMetricName).label}
                <p className="font-mono text-[11px] text-text-3">{x.metricKey}</p>
              </Td>
              <Td>{x.unit || "—"}</Td>
              <Td>{x.originalUnit || <span className="text-text-3">none</span>}</Td>
              <Td>{x.statistic ?? "—"}</Td>
              <Td className="font-mono text-xs">{x.sensorId?.split("#")[1] ?? "—"}</Td>
            </tr>
          ))}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sync diagnostics" icon={<Stethoscope className="size-4" />} />
          <CardBody className="space-y-2 text-sm">
            <p className="text-text-2">
              Provider snapshot retrieved <TimeAgo iso={provider.fetchedAt} /> in {provider.durationMs} ms
              {provider.stale && <span className="text-warn"> — latest refresh failed; showing last successful data</span>}.
            </p>
            {view.errors.length ? (
              view.errors.map((e, i) => (
                <p key={i} className="rounded-md bg-critical-soft px-2 py-1.5 text-xs text-critical">
                  {e.label}: {e.message}
                </p>
              ))
            ) : (
              <p className="text-xs text-good">No errors on the latest request.</p>
            )}
            <ul className="list-disc space-y-1 pl-4 text-xs text-text-3">
              {provider.capabilities.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Source metadata" description="Provider-specific details, unmodified." />
          <CardBody>
            <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text-2">{JSON.stringify(s.metadata, null, 2)}</pre>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/stations/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
