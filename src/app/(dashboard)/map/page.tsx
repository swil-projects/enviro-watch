import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { MapView } from "@/components/map/map-view";
import { requireUser } from "@/lib/auth/session";
import { getUnifiedSnapshot } from "@/lib/service";
import { toStationRow } from "@/lib/overview";

export const metadata = { title: "Map View" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const snap = await getUnifiedSnapshot();
  return <MapView rows={snap.stations.map(toStationRow)} initialSelected={typeof sp.station === "string" ? sp.station : undefined} />;
}

export default function Page(props: PageProps<"/map">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
