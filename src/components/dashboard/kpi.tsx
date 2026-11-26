import { cn } from "@/lib/utils";

export function Kpi({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; tone?: "good" | "warn" | "critical" | "neutral" }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-4">
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5", tone === "good" ? "bg-good/60" : tone === "warn" ? "bg-warn/60" : tone === "critical" ? "bg-critical/60" : "bg-border-strong")} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-3">{label}</p>
        {icon && <span className={cn("[&_svg]:size-4", tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "critical" ? "text-critical" : "text-text-3")}>{icon}</span>}
      </div>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-text">{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-text-3">{sub}</p>}
    </div>
  );
}
