import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { AlertsClient } from "@/components/dashboard/alerts-client";
import { requireUser } from "@/lib/auth/session";
import { getUnifiedSnapshot } from "@/lib/service";
import { getAlerts } from "@/lib/alerts";
import { metricOptions } from "@/lib/page-data";
import { METRICS } from "@/lib/metrics/registry";

export const metadata = { title: "Alerts" };

async function Content() {
  await requireUser();
  const snap = await getUnifiedSnapshot();
  const alerts = await getAlerts(snap);
  // Offer every known metric plus provider-specific ones present in the data.
  const present = metricOptions(snap);
  const known = Object.values(METRICS).map((m) => ({ key: m.key, label: m.label }));
  const metrics = [...known, ...present.filter((p) => !(p.key in METRICS))];
  return <AlertsClient initial={alerts} metrics={metrics} stations={snap.stations.map((s) => ({ id: s.station.id, name: s.station.name }))} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
