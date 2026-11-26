"use client";
import Link from "next/link";
import { ArrowUpRight, Timer } from "lucide-react";
import { ProviderDot, ProviderStatusBadge, TimeAgo } from "./status";
import type { ProviderSummary } from "@/lib/overview";

export function ProviderCard({ p }: { p: ProviderSummary }) {
  return (
    <Link href={`/${p.slug}`} className="group block rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ProviderDot provider={p.provider} className="size-2.5" />
          <h3 className="text-sm font-semibold">{p.name}</h3>
          {p.isDemo && <span className="text-[10px] font-semibold uppercase tracking-wide text-serious">demo</span>}
        </div>
        <ArrowUpRight className="size-4 text-text-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
      </div>
      <div className="mt-2.5">
        <ProviderStatusBadge status={p.status} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-text-3">Configured</dt>
          <dd className="tabular mt-0.5 font-medium text-text">{p.provider === "OBSCAPE" ? "account" : p.configuredDeviceCount}</dd>
        </div>
        <div>
          <dt className="text-text-3">Discovered</dt>
          <dd className="tabular mt-0.5 font-medium text-text">{p.discoveredCount}</dd>
        </div>
        <div>
          <dt className="text-text-3">Reporting</dt>
          <dd className="tabular mt-0.5 font-medium text-text">{p.reportingCount}</dd>
        </div>
      </dl>
      <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-text-3">
        <p className="flex justify-between gap-2">
          <span>Last API success</span>
          <TimeAgo iso={p.lastSuccessAt} className="text-text-2" />
        </p>
        <p className="flex justify-between gap-2">
          <span>Last observation</span>
          <TimeAgo iso={p.lastObservationAt} className="text-text-2" />
        </p>
        <p className="flex justify-between gap-2">
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3" aria-hidden /> Request time
          </span>
          <span className="tabular text-text-2">{p.durationMs} ms</span>
        </p>
      </div>
      {p.errors[0] && (
        <p className="mt-3 line-clamp-2 rounded-md bg-critical-soft px-2 py-1.5 text-xs text-critical" title={p.errors[0].message}>
          {p.errors[0].label}: {p.errors[0].message}
        </p>
      )}
      {!p.errors.length && p.warnings[0] && <p className="mt-3 line-clamp-2 rounded-md bg-warn-soft px-2 py-1.5 text-xs text-warn">{p.warnings[0]}</p>}
      {p.stale && <p className="mt-2 text-xs text-warn">Showing last successful data — latest refresh failed.</p>}
    </Link>
  );
}
