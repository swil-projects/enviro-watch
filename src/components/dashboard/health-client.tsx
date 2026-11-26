"use client";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, CircleMinus, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { ProviderTag, TimeAgo } from "./status";
import { apiGet } from "@/lib/fetcher";
import { ERROR_KIND_HINT, type ProviderErrorKind } from "@/lib/integrations/errors";
import type { ProviderHealth } from "@/lib/integrations/contracts";

const STATUS: Record<ProviderHealth["status"], { tone: Tone; label: string }> = {
  healthy: { tone: "good", label: "Healthy" },
  degraded: { tone: "warn", label: "Degraded" },
  down: { tone: "critical", label: "Down" },
  not_configured: { tone: "neutral", label: "Not configured" },
};
const STEP_ICON = {
  ok: <CheckCircle2 className="size-4 text-good" aria-label="ok" />,
  warn: <TriangleAlert className="size-4 text-warn" aria-label="warning" />,
  error: <XCircle className="size-4 text-critical" aria-label="error" />,
  skipped: <CircleMinus className="size-4 text-text-3" aria-label="skipped" />,
};

export function HealthClient({ initial }: { initial: ProviderHealth[] }) {
  const q = useQuery({ queryKey: ["health"], queryFn: () => apiGet<ProviderHealth[]>("/api/integrations/health"), initialData: initial });
  const force = async () => {
    await q.refetch({ cancelRefetch: true });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-text-2">Lightweight checks (small windows, no historical backfill). Results are cached for 60 s. Credentials are never displayed.</p>
        <Button
          size="sm"
          className="ml-auto"
          disabled={q.isFetching}
          onClick={async () => {
            await apiGet<ProviderHealth[]>("/api/integrations/health?force=1").then(() => force());
          }}
        >
          <RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Re-run checks
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {q.data.map((h) => (
          <Card key={h.provider} className="flex flex-col">
            <CardHeader title={<ProviderTag provider={h.provider} className="text-sm font-semibold text-text" />} action={<Badge tone={STATUS[h.status].tone}>{STATUS[h.status].label}</Badge>} />
            <CardBody className="flex-1 space-y-4">
              <div className="flex justify-between text-xs text-text-3">
                <span>
                  Checked <TimeAgo iso={h.checkedAt} />
                </span>
                <span className="tabular">{h.latencyMs !== null ? `${h.latencyMs} ms` : "—"}</span>
              </div>
              <ol className="space-y-2">
                {h.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <span className="mt-0.5">{STEP_ICON[s.status]}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-text">{s.name}</p>
                      <p className="break-words text-xs text-text-3">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {h.errors.map((e, i) => (
                <div key={i} className="rounded-lg border border-critical/30 bg-critical-soft p-3 text-xs">
                  <p className="font-semibold text-critical">
                    {e.label}
                    {e.status ? ` · HTTP ${e.status}` : ""}
                    {e.providerCode !== undefined ? ` · code ${e.providerCode}` : ""}
                  </p>
                  <p className="mt-1 break-words text-text-2">{e.message}</p>
                  <p className="mt-1.5 text-text-3">{ERROR_KIND_HINT[e.kind as ProviderErrorKind]}</p>
                </div>
              ))}
              {h.responseShape !== undefined && (
                <details className="group rounded-lg border border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-text-2">
                    Response shape (keys & types only)
                    <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <pre className="max-h-72 overflow-auto border-t border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text-2">{JSON.stringify(h.responseShape, null, 2)}</pre>
                </details>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
