import Link from "next/link";
import { ArrowUpRight, Waves } from "lucide-react";
import { TimeAgo } from "./status";
import type { Overview } from "@/lib/overview";

export function NetworkPulse({ data }: { data: Overview }) {
  const k = data.kpis;
  const percentage = k.stations ? Math.round(k.reporting / k.stations * 100) : null;
  const unclassified = Math.max(0, k.stations - k.reporting - k.stale - k.offline);
  const states = [
    { label: "Reporting", count: k.reporting, color: "var(--good)" },
    { label: "Stale", count: k.stale, color: "var(--warn)" },
    { label: "Offline / error", count: k.offline, color: "var(--critical)" },
    { label: "Unknown", count: unclassified, color: "var(--text-3)" },
  ];
  return (
    <section aria-label="Network pulse" className="network-pulse grid overflow-hidden rounded-2xl border border-border lg:grid-cols-[1.3fr_1fr]">
      <div className="relative flex flex-col justify-between gap-6 p-5 sm:p-7">
        <div className="relative z-10">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-accent-text"><Waves className="size-5" aria-hidden />Environmental intelligence</p>
          <h2 className="max-w-lg text-2xl font-semibold tracking-tight sm:text-3xl">Your monitoring network,<br className="hidden sm:block" /> in perspective.</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-text-2">Weather, marine conditions and field sensors in one view. Follow changing conditions and see where your data needs attention.</p>
        </div>
        <div className="relative z-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-2">
          <span className="rounded-full border border-border-strong bg-surface/70 px-2.5 py-1">{data.isDemo ? "Synthetic demo network" : "Provider API data"}</span>
          <span>Snapshot <TimeAgo iso={data.fetchedAt} /></span>
          <Link href="/analytics" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">Explore analytics <ArrowUpRight className="size-3.5" aria-hidden /></Link>
        </div>
      </div>
      <div className="border-t border-border bg-surface/85 p-5 sm:p-7 lg:border-l lg:border-t-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-text-2">Network reporting</h3>
            <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{percentage === null ? "—" : `${percentage}%`}</p>
            <p className="mt-1 text-xs text-text-3">{k.reporting} of {k.stations} stations within their freshness window</p>
          </div>
          <Link href="/integrations" className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-2 hover:border-accent">View health</Link>
        </div>
        <div className="my-4 flex h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          {states.filter((state) => state.count > 0).map((state) => <span key={state.label} style={{ width: `${state.count / k.stations * 100}%`, background: state.color }} />)}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-2">
          {states.filter((state) => state.label !== "Unknown" || state.count).map((state) => <li key={state.label} className="flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-full" style={{ background: state.color }} />{state.label} <span className="tabular font-semibold text-text">{state.count}</span></li>)}
        </ul>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
          <div><dt className="text-text-3">Measurements</dt><dd className="tabular mt-1 text-base font-semibold">{data.diagnostics.distinctMetrics}</dd></div>
          <div><dt className="text-text-3">Series available</dt><dd className="tabular mt-1 text-base font-semibold">{data.diagnostics.availableSeries}<span className="text-xs font-normal text-text-3"> / {data.diagnostics.expectedSeries}</span></dd></div>
          <div><dt className="text-text-3">Quality flags</dt><dd className={`tabular mt-1 text-base font-semibold ${data.diagnostics.flaggedReadings ? "text-warn" : ""}`}>{data.diagnostics.flaggedReadings}</dd></div>
        </dl>
      </div>
    </section>
  );
}
