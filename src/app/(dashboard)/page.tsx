import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { OverviewClient } from "@/components/dashboard/overview-client";
import { requireUser } from "@/lib/auth/session";
import { getUnifiedSnapshot } from "@/lib/service";
import { buildOverview } from "@/lib/overview";
import { metricOptions, stationOptions } from "@/lib/page-data";

export const metadata = { title: "Overview" };

async function Content() {
  await requireUser();
  const snap = await getUnifiedSnapshot();
  const stations = stationOptions(snap);
  return <OverviewClient initial={await buildOverview(snap)} stations={stations} metrics={metricOptions(snap, stations)} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
