"use client";
import { CircleAlert, CircleCheck, CircleDashed, CircleX, Clock3, TriangleAlert, WifiOff } from "lucide-react";
import { useNow } from "@/hooks/use-client";
import { Badge, type Tone } from "@/components/ui/badge";
import { PROVIDER_META, type ProviderType } from "@/lib/integrations/contracts";
import { FRESHNESS_LABEL, type Freshness } from "@/lib/freshness";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useTimezone } from "@/components/providers/timezone";
import { cn } from "@/lib/utils";

const FRESH: Record<Freshness, { tone: Tone; icon: React.ReactNode }> = {
  live: { tone: "good", icon: <CircleCheck aria-hidden /> },
  stale: { tone: "warn", icon: <Clock3 aria-hidden /> },
  offline: { tone: "neutral", icon: <WifiOff aria-hidden /> },
  error: { tone: "critical", icon: <CircleX aria-hidden /> },
};

export function FreshnessBadge({ value, className }: { value: Freshness; className?: string }) {
  const f = FRESH[value];
  return (
    <Badge tone={f.tone} className={className}>
      {f.icon}
      {FRESHNESS_LABEL[value]}
    </Badge>
  );
}

export function ProviderDot({ provider, className }: { provider: ProviderType; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: PROVIDER_META[provider].color }} />;
}

export function ProviderTag({ provider, className }: { provider: ProviderType; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-text-2", className)}>
      <ProviderDot provider={provider} />
      {PROVIDER_META[provider].name}
    </span>
  );
}

export type ProviderStatus = "connected" | "degraded" | "error" | "not_configured";
const PSTATUS: Record<ProviderStatus, { tone: Tone; label: string; icon: React.ReactNode }> = {
  connected: { tone: "good", label: "Connected", icon: <CircleCheck aria-hidden /> },
  degraded: { tone: "warn", label: "Degraded", icon: <TriangleAlert aria-hidden /> },
  error: { tone: "critical", label: "Error", icon: <CircleAlert aria-hidden /> },
  not_configured: { tone: "neutral", label: "Not configured", icon: <CircleDashed aria-hidden /> },
};
export function ProviderStatusBadge({ status }: { status: ProviderStatus }) {
  const s = PSTATUS[status];
  return (
    <Badge tone={s.tone}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

/** Relative time that re-renders every 15 s; absolute time (in the chosen zone) on hover. */
export function TimeAgo({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const tz = useTimezone();
  const now = useNow();
  if (!iso) return <span className={className}>never</span>;
  return (
    <time dateTime={iso} title={`${formatDateTime(iso, tz, "d MMM yyyy, HH:mm:ss")} (${tz})`} className={cn("tabular", className)} suppressHydrationWarning>
      {now === null ? formatDateTime(iso, tz, "HH:mm") : timeAgo(iso, now)}
    </time>
  );
}

export function DateTime({ iso, pattern, className }: { iso: string | number | null | undefined; pattern?: string; className?: string }) {
  const tz = useTimezone();
  return (
    <span className={cn("tabular", className)} suppressHydrationWarning>
      {formatDateTime(iso, tz, pattern)}
    </span>
  );
}

const QUALITY_TEXT: Record<string, string> = {
  out_of_plausible_range: "Outside the physically plausible range — check the sensor",
  missing_unit: "Provider did not report a unit",
  unknown_unit: "Unrecognised unit — value shown as reported",
  unit_dimension_mismatch: "Reported unit doesn't match the measurement type — value shown as reported",
};
export function QualityFlag({ flag }: { flag: string | null | undefined }) {
  if (!flag) return null;
  return (
    <span title={QUALITY_TEXT[flag] ?? flag} className="inline-flex items-center text-warn">
      <TriangleAlert className="size-3.5" aria-label={QUALITY_TEXT[flag] ?? flag} />
    </span>
  );
}

export function OriginTag({ origin }: { origin: string | null | undefined }) {
  if (!origin) return null;
  const map: Record<string, { label: string; tone: Tone }> = {
    PROVIDER_HISTORY: { label: "Provider history", tone: "accent" },
    PROVIDER_REALTIME: { label: "Real-time", tone: "good" },
    DEMO: { label: "Demo data", tone: "serious" },
  };
  const m = map[origin] ?? { label: origin, tone: "neutral" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
