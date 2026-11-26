"use client";
import Link from "next/link";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { ProviderTag, TimeAgo } from "./status";
import type { AlertEvent } from "@/lib/alerts";

export const SEVERITY = {
  critical: { tone: "critical" as const, icon: <CircleAlert aria-hidden />, label: "Critical" },
  warning: { tone: "warn" as const, icon: <TriangleAlert aria-hidden />, label: "Warning" },
  info: { tone: "accent" as const, icon: <Info aria-hidden />, label: "Info" },
};

export function AlertList({ alerts, empty = "No active alerts", pageSize = 5 }: { alerts: AlertEvent[]; empty?: string; pageSize?: number }) {
  const pg = usePagination(alerts, pageSize);
  if (!alerts.length) return <p className="py-6 text-center text-sm text-text-3">{empty}</p>;
  return (
    <div>
    <ul className="divide-y divide-border">
      {pg.pageItems.map((a) => {
        const s = SEVERITY[a.severity];
        return (
          <li key={a.key + (a.resolvedAt ?? "")} className="flex gap-3 py-3">
            <Badge tone={a.status === "resolved" ? "neutral" : s.tone} className="h-fit">
              {s.icon}
              {a.status === "resolved" ? "Resolved" : s.label}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">{a.ruleName}</p>
              <p className="mt-0.5 text-xs text-text-2">{a.message}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
                {a.provider && <ProviderTag provider={a.provider} />}
                {a.stationId && (
                  <Link className="hover:text-text hover:underline" href={`/stations/${encodeURIComponent(a.stationId)}`}>
                    {a.stationName}
                  </Link>
                )}
                <span>
                  detected <TimeAgo iso={a.firstDetectedAt} />
                </span>
                {a.resolvedAt && (
                  <span>
                    resolved <TimeAgo iso={a.resolvedAt} />
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
    <Pagination {...pg} onPage={pg.setPage} label="alerts" compact className="border-t border-border py-2.5" />
    </div>
  );
}
