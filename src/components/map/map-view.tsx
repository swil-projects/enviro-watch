"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { MapPinOff } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FreshnessBadge, ProviderTag } from "@/components/dashboard/status";
import type { StationRow } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { Pagination, usePagination } from "@/components/ui/pagination";

const StationMap = dynamic(() => import("./station-map"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-surface-2" /> });

export function MapView({ rows, initialSelected }: { rows: StationRow[]; initialSelected?: string }) {
  const located = rows.filter((r) => r.latitude !== null && r.longitude !== null);
  const unlocated = rows.filter((r) => r.latitude === null || r.longitude === null);
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  const locPg = usePagination(located, 8);
  const unlocPg = usePagination(unlocated, 6);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <div className="h-[60vh] min-h-96 p-2">
          <StationMap rows={located} selectedId={selected} onSelect={setSelected} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-text-3">
          <span>Fill = status:</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-good" /> Reporting</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-warn" /> Stale</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-text-3" /> Offline</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-critical" /> Error</span>
          <span className="ml-2">Ring = provider</span>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title={`On the map (${located.length})`} />
          <ul className="divide-y divide-border">
            {locPg.pageItems.map((r) => (
              <li key={r.id}>
                <button onClick={() => setSelected(r.id)} aria-pressed={selected === r.id} className={cn("flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-surface-2", selected === r.id && "bg-accent-soft")}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <ProviderTag provider={r.provider} />
                  </div>
                  <FreshnessBadge value={r.freshness} />
                </button>
              </li>
            ))}
            {!located.length && <li className="px-4 py-6 text-center text-xs text-text-3">No provider supplied coordinates.</li>}
          </ul>
          <Pagination {...locPg} onPage={locPg.setPage} label="stations" compact className="border-t border-border px-4 py-2.5" />
        </Card>
        <Card>
          <CardHeader title={`Without coordinates (${unlocated.length})`} description="The provider API does not report a location for these; none is invented." icon={<MapPinOff className="size-4" />} />
          <CardBody className="py-2">
            <ul className="divide-y divide-border">
              {unlocPg.pageItems.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <Link href={`/stations/${encodeURIComponent(r.id)}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                    {r.name}
                  </Link>
                  <FreshnessBadge value={r.freshness} />
                </li>
              ))}
              {!unlocated.length && <li className="py-3 text-center text-xs text-text-3">All stations are located.</li>}
            </ul>
            <Pagination {...unlocPg} onPage={unlocPg.setPage} label="stations" compact className="border-t border-border pt-2.5" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
