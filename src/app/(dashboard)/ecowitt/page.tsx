import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ProviderPage } from "@/components/dashboard/provider-page";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Ecowitt" };

async function Content() {
  await requireUser();
  return (
    <ProviderPage
      provider="ECOWITT"
      intro={
        <>
          <p>Ecowitt gateways and consoles report grouped real-time measurements (outdoor, indoor, wind, pressure, rainfall, solar &amp; UV, soil, air quality, lightning, batteries). Devices on the account are discovered automatically and merged with the configured MAC addresses.</p><p className="text-xs text-text-3">Contract verified against the official Ecowitt API v3 documentation (real_time, history, device/list, device/info). Real-time data covers the last 2 hours; history is retrieved from the provider at 5-min to 1-day resolution depending on the period.</p>
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
