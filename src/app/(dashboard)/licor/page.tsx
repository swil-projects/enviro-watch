import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ProviderPage } from "@/components/dashboard/provider-page";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "LI-COR Cloud" };

async function Content() {
  await requireUser();
  return (
    <ProviderPage
      provider="LICOR"
      intro={
        <>
          <p>LI-COR Cloud (formerly HOBOlink) organises data by <strong>logger</strong> serial number, each carrying several <strong>smart sensors</strong>. Every observation identifies its logger, sensor serial, measurement type, logged statistic (e.g. average, maximum), value and unit.</p><p className="text-xs text-text-3">Contract verified against the OpenAPI document served at api.licor.cloud/v1/docs (GET /v1/data). Times are requested and stored in UTC.</p>
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
