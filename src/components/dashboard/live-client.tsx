"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Pause, Play, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { FreshnessBadge, ProviderTag, QualityFlag, TimeAgo } from "./status";
import { apiGet } from "@/lib/fetcher";
import { formatValue } from "@/lib/format";
import { CATEGORY_LABEL, getMetric } from "@/lib/metrics/registry";
import type { StationView } from "@/lib/service";
import { PROVIDERS, PROVIDER_META, type ProviderType } from "@/lib/integrations/contracts";

interface LiveData {
  fetchedAt: string;
  isDemo: boolean;
  refreshIntervalSeconds: number;
  stations: StationView[];
}

/**
 * Near-real-time view. The providers expose REST polling only (no streaming), so this
 * page re-reads the shared server snapshot on an interval; the server itself only calls
 * the providers when its cached snapshot expires.
 */
export function LiveClient({ initial }: { initial: LiveData }) {
  const [paused, setPaused] = useState(false);
  const [provider, setProvider] = useState<ProviderType | "">("");
  const q = useQuery({
    queryKey: ["live"],
    queryFn: () => apiGet<LiveData>("/api/live"),
    initialData: initial,
    refetchInterval: paused ? false : Math.max(30, initial.refreshIntervalSeconds) * 1000,
  });
  const stations = useMemo(() => q.data.stations.filter((s) => !provider || s.station.provider === provider), [q.data, provider]);
  const pg = usePagination(stations, 6);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
        <span className="flex items-center gap-2 text-sm">
          <Radio className={`size-4 ${paused ? "text-text-3" : "pulse-dot text-good"}`} aria-hidden />
          {paused ? "Auto-refresh paused" : `Auto-refresh every ${Math.max(30, initial.refreshIntervalSeconds)} s`}
        </span>
        <span className="text-xs text-text-3">
          Snapshot from providers <TimeAgo iso={q.data.fetchedAt} className="text-text-2" />
          {q.isFetching && <span className="ml-2 text-accent-text">updating…</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select aria-label="Filter by provider" value={provider} onChange={(e) => setProvider(e.target.value as ProviderType | "")}>
            <option value="">All providers</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_META[p].name}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? <Play /> : <Pause />} {paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-text-3">
        Polling note: these APIs are request/response only. Values update when the provider has a new observation; “time since observation” shows the collection delay.
      </p>

      {!stations.length && <EmptyState title="No stations">No provider returned any station. See Integration Health.</EmptyState>}
      <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {pg.pageItems.map((s) => (
          <StationLiveCard key={s.station.id} s={s} />
        ))}
      </div>
      <Pagination {...pg} onPage={pg.setPage} onPageSize={pg.setPageSize} pageSizes={[6, 12, 24]} label="stations" />
    </div>
  );
}

const CAT_ORDER = Object.keys(CATEGORY_LABEL);

export function StationLiveCard({ s, pageSize = 12 }: { s: StationView; pageSize?: number }) {
  // Readings ordered by category then label, paged instead of scrolled.
  const sorted = [...s.latest].sort((a, b) => {
    const ma = getMetric(a.metricKey, a.originalMetricName);
    const mb = getMetric(b.metricKey, b.originalMetricName);
    return CAT_ORDER.indexOf(ma.category) - CAT_ORDER.indexOf(mb.category) || ma.label.localeCompare(mb.label);
  });
  const pg = usePagination(sorted, pageSize);
  const groups = new Map<string, StationView["latest"]>();
  for (const o of pg.pageItems) {
    const cat = getMetric(o.metricKey).category;
    groups.set(cat, [...(groups.get(cat) ?? []), o]);
  }
  return (
    <article className="rounded-xl border border-border bg-surface shadow-card">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <Link href={`/stations/${encodeURIComponent(s.station.id)}`} className="block truncate text-sm font-semibold hover:underline">
            {s.station.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-3">
            <ProviderTag provider={s.station.provider} />
            <span>
              last obs <TimeAgo iso={s.station.lastSeenAt} className="text-text-2" />
            </span>
          </div>
        </div>
        <FreshnessBadge value={s.freshness} />
      </header>
      <div className="px-4 py-3">
        {s.errors.map((e, i) => (
          <p key={i} className="mb-2 flex gap-1.5 rounded-md bg-critical-soft px-2 py-1.5 text-xs text-critical">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {e.label}: {e.message}
          </p>
        ))}
        {!s.latest.length && !s.errors.length && <p className="py-4 text-center text-xs text-text-3">{s.station.providerStatus ?? "No current readings"}</p>}
        {[...groups.entries()].map(([cat, obs]) => (
          <div key={cat} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-3">{CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL]}</p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {obs.map((o) => {
                const m = getMetric(o.metricKey, o.originalMetricName);
                return (
                  <div key={o.seriesId} className="rounded-lg bg-surface-2 px-2.5 py-2" title={`${o.originalMetricName} · reported ${o.originalValue ?? ""} ${o.originalUnit ?? ""}`}>
                    <dt className="truncate text-[11px] text-text-3">{m.key.includes(":") ? o.originalMetricName : m.shortLabel ?? m.label}</dt>
                    <dd className="mt-0.5 flex items-baseline gap-1">
                      <span className="tabular text-base font-semibold">{formatValue(o.value, m.decimals)}</span>
                      <span className="text-[11px] text-text-3">{o.unit}</span>
                      <QualityFlag flag={o.qualityFlag} />
                    </dd>
                    <TimeAgo iso={o.observedAt} className="text-[10px] text-text-3" />
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
        <Pagination {...pg} onPage={pg.setPage} label="readings" compact className="mt-3 border-t border-border pt-2.5" />
      </div>
    </article>
  );
}
