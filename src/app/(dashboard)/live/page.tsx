import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { LiveClient } from "@/components/dashboard/live-client";
import { requireUser } from "@/lib/auth/session";
import { getUnifiedSnapshot } from "@/lib/service";

export const metadata = { title: "Live Monitoring" };

async function Content() {
  await requireUser();
  const snap = await getUnifiedSnapshot();
  return <LiveClient initial={{ fetchedAt: snap.fetchedAt, isDemo: snap.isDemo, refreshIntervalSeconds: snap.refreshIntervalSeconds, stations: snap.stations }} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
