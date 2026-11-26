import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ExplorerClient } from "@/components/dashboard/explorer-client";
import { EmptyState } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth/session";
import { getUnifiedSnapshot } from "@/lib/service";

export const metadata = { title: "Data Explorer" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const snap = await getUnifiedSnapshot();
  const stations = snap.stations.filter((s) => s.series.length).map((s) => ({ id: s.station.id, name: s.station.name, provider: s.station.provider, series: s.series }));
  if (!stations.length) return <EmptyState title="No stations with measurements">Connect a provider (see Integration Health) to explore data.</EmptyState>;
  return <ExplorerClient stations={stations} initialStation={typeof sp.station === "string" ? sp.station : undefined} />;
}

export default function Page(props: PageProps<"/explorer">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
