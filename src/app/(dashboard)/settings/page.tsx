import { Suspense } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DisplaySettings } from "@/components/dashboard/settings-client";
import { requireUser, authMode } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata = { title: "Settings" };

function Flag({ on, label, detail }: { on: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-text-2">
        {label}
        {detail && <span className="block text-xs text-text-3">{detail}</span>}
      </span>
      <span className={`inline-flex items-center gap-1 text-xs ${on ? "text-good" : "text-text-3"}`}>
        {on ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
        {on ? "set" : "not set"}
      </span>
    </li>
  );
}

async function Content() {
  const user = await requireUser();
  const e = getEnv();
  return (
    <div className="space-y-5">
      <DisplaySettings defaultTz={e.appTimezone} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Runtime configuration" description="Read from environment variables at startup. Secret values are never shown." />
          <CardBody className="py-2">
            <dl className="divide-y divide-border/60 text-sm">
              {[
                ["Mode", e.demoMode ? "DEMO (synthetic data)" : "Live provider APIs"],
                ["Architecture", "API-driven · no database · in-memory cache"],
                ["Snapshot reuse window", `${e.refreshIntervalSeconds} s`],
                ["Stale after", `${e.staleAfterMinutes} min (offline after ${e.staleAfterMinutes * 6} min)`],
                ["Maximum history query", `${e.maxHistoryDays} days`],
                ["Default time zone", e.appTimezone],
                ["Authentication", authMode() === "enabled" ? `enabled — signed in as ${user.username}` : authMode() === "open-dev" ? "disabled (development only)" : "misconfigured"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt className="text-text-3">{k}</dt>
                  <dd className="text-right text-text">{v}</dd>
                </div>
              ))}
            </dl>
            {e.problems.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-md bg-warn-soft p-2 text-xs text-warn">
                {e.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Provider credentials" description="Presence only." />
          <CardBody className="py-2">
            <ul>
              <Flag on={Boolean(e.obscape.username)} label="OBSCAPE_USERNAME" />
              <Flag on={Boolean(e.obscape.apiKey)} label="OBSCAPE_API_KEY" />
              <Flag on={e.obscape.projects.length > 0} label="OBSCAPE_PROJECTS" detail={e.obscape.projects.length ? `${e.obscape.projects.length} project filter(s)` : "optional — all projects"} />
              <Flag on={Boolean(e.licor.token)} label="LICOR_API_TOKEN" />
              <Flag on={e.licor.loggerSerials.length > 0} label="LICOR_LOGGER_SERIALS" detail={e.licor.loggerSerials.join(", ") || undefined} />
              <Flag on={Boolean(e.ecowitt.applicationKey)} label="ECOWITT_APPLICATION_KEY" />
              <Flag on={Boolean(e.ecowitt.apiKey)} label="ECOWITT_API_KEY" />
              <Flag on={e.ecowitt.devices.length > 0} label="ECOWITT_DEVICE_MACS" detail={e.ecowitt.devices.map((d) => d.mac ?? d.imei).join(", ") || "optional — account devices are discovered"} />
            </ul>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Alert rules" />
        <CardBody className="text-sm text-text-2">Alert rules are stored in <code className="font-mono text-xs">config/alert-rules.json</code> and can be edited on the Alerts page (on writable deployments) or in the repository.</CardBody>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
