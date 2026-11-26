import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ProviderPage } from "@/components/dashboard/provider-page";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Obscape" };

async function Content() {
  await requireUser();
  return (
    <ProviderPage
      provider="OBSCAPE"
      intro={
        <>
          <p>Obscape operates wave buoys, water-level gauges and coastal weather stations. Data is organised by <strong>project</strong> and <strong>station</strong>; parameters typically include significant wave height, wave period and direction, water level and meteorological values.</p><p className="text-xs text-text-3">Obscape publishes no API v3 reference. The project → station → device → data contract used here was verified against the live API with your credentials. Internal logger temperature/humidity are kept separate from ambient air measurements.</p>
        </>
      }
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
