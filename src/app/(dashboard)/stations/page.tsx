import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StationsTable } from "@/components/dashboard/stations-table";
import { requireUser } from "@/lib/auth/session";
import { getUnifiedSnapshot } from "@/lib/service";
import { toStationRow } from "@/lib/overview";

export const metadata = { title: "Stations & Devices" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const snap = await getUnifiedSnapshot();
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  return (
    <Card>
      <CardHeader title="Unified inventory" description="Every station, logger and device discovered across Obscape, LI-COR Cloud and Ecowitt. Select a row for details." />
      <CardBody>
        <StationsTable rows={snap.stations.map(toStationRow)} initialQuery={q} />
      </CardBody>
    </Card>
  );
}

export default function Page(props: PageProps<"/stations">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
