import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { HealthClient } from "@/components/dashboard/health-client";
import { requireUser } from "@/lib/auth/session";
import { getHealth } from "@/lib/service";

export const metadata = { title: "Integration Health" };

async function Content() {
  await requireUser();
  return <HealthClient initial={await getHealth()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
