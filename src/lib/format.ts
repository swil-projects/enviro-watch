import { TZDate } from "@date-fns/tz";
import { format, formatDistanceStrict } from "date-fns";

/** Client/server-safe formatting helpers. Never substitutes missing values with zero. */
export function formatValue(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatDateTime(iso: string | number | null | undefined, tz: string, pattern = "d MMM yyyy, HH:mm"): string {
  if (iso === null || iso === undefined) return "—";
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  try {
    return format(new TZDate(t, tz), pattern);
  } catch {
    return format(new Date(t), pattern);
  }
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  if (Math.abs(now - t) < 45_000) return "just now";
  return formatDistanceStrict(t, now, { addSuffix: true });
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(minutes < 600 ? 1 : 0)} h`;
  return `${(minutes / 1440).toFixed(1)} d`;
}

export function pct(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;
}
