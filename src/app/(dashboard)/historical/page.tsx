import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { HistoricalClient } from "@/components/dashboard/historical-client";
import { requireUser } from "@/lib/auth/session";
import { getUnifiedSnapshot } from "@/lib/service";
import { metricOptions, stationOptions } from "@/lib/page-data";
import type { ProviderType } from "@/lib/integrations/contracts";

export const metadata = { title: "Historical Data" };

async function Content() {
  await requireUser();
  const snap = await getUnifiedSnapshot();
  const opts = stationOptions(snap);
  const stations = opts.map((o) => ({ ...o, project: snap.stations.find((s) => s.station.id === o.id)?.station.projectName ?? null }));
  const capabilities = Object.fromEntries(snap.providers.map((p) => [p.provider, { history: p.capabilities.history, notes: p.capabilities.notes }])) as Record<ProviderType, { history: "supported" | "unsupported" | "unverified"; notes: string[] }>;
  return <HistoricalClient stations={stations} metrics={metricOptions(snap, opts)} capabilities={capabilities} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
