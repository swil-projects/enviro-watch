"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleHelp, Database, XCircle } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { buttonVariants } from "@/components/ui/button";
import { TimeseriesPanel, type MetricOption, type StationOption } from "./timeseries-panel";
import { PROVIDERS, PROVIDER_META, type CapabilityStatus, type ProviderType } from "@/lib/integrations/contracts";

export interface HistoricalStation extends StationOption {
  project: string | null;
}

const CAP: Record<CapabilityStatus, { icon: React.ReactNode; label: string; cls: string }> = {
  supported: { icon: <CheckCircle2 className="size-4" aria-hidden />, label: "Provider history available", cls: "text-good" },
  unverified: { icon: <CircleHelp className="size-4" aria-hidden />, label: "Limited / unverified history", cls: "text-warn" },
  unsupported: { icon: <XCircle className="size-4" aria-hidden />, label: "No provider history", cls: "text-critical" },
};

export function HistoricalClient({ stations, metrics, capabilities }: { stations: HistoricalStation[]; metrics: MetricOption[]; capabilities: Record<ProviderType, { history: CapabilityStatus; notes: string[] }> }) {
  const [provider, setProvider] = useState<ProviderType | "">("");
  const [project, setProject] = useState("");
  const filtered = useMemo(() => stations.filter((s) => (!provider || s.provider === provider) && (!project || s.project === project)), [stations, provider, project]);
  const [stationId, setStationId] = useState(stations[0]?.id ?? "");
  const station = filtered.find((s) => s.id === stationId) ?? filtered[0];
  const projects = [...new Set(stations.filter((s) => !provider || s.provider === provider).map((s) => s.project).filter(Boolean))] as string[];
  const stationMetrics = metrics.filter((m) => station?.metrics.includes(m.key));
  const cap = station ? capabilities[station.provider] : null;

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-text-2">
            Provider
            <Select value={provider} onChange={(e) => { setProvider(e.target.value as ProviderType | ""); setProject(""); }}>
              <option value="">All</option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{PROVIDER_META[p].name}</option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-text-2">
            Project / site
            <Select value={project} onChange={(e) => setProject(e.target.value)} disabled={!projects.length}>
              <option value="">{projects.length ? "All" : "None reported"}</option>
              {projects.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </label>
          <label className="flex min-w-64 flex-col gap-1 text-xs font-medium text-text-2">
            Station / device
            <Select value={station?.id ?? ""} onChange={(e) => setStationId(e.target.value)}>
              {filtered.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {PROVIDER_META[s.provider].name}</option>
              ))}
            </Select>
          </label>
          {station && (
            <Link href={`/explorer?station=${encodeURIComponent(station.id)}`} className={buttonVariants({ size: "md", className: "ml-auto" })}>
              <Database /> Table & CSV export
            </Link>
          )}
        </CardBody>
      </Card>

      {cap && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-xs shadow-card">
          <span className={`inline-flex items-center gap-1.5 font-medium ${CAP[cap.history].cls}`}>
            {CAP[cap.history].icon}
            {CAP[cap.history].label}
          </span>
          <ul className="flex-1 space-y-0.5 text-text-3">
            {cap.notes.slice(0, 3).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {station && stationMetrics.length ? (
        <TimeseriesPanel key={station.id} title={`${station.name}`} description="Historical observations retrieved on demand from the provider. Gaps are shown as breaks, never as zero." stations={[station]} metrics={stationMetrics} defaultStationIds={[station.id]} lockStations defaultRange={{ range: "7d" }} />
      ) : (
        <p className="text-sm text-text-3">{station ? "This station has no measurements to chart." : "No stations available."}</p>
      )}
    </div>
  );
}
