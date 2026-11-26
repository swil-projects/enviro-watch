/**
 * Freshness classification (shared by server and client).
 *
 *   live     – newest observation is within STALE_AFTER_MINUTES
 *   stale    – older than that, but within 6× the threshold
 *   offline  – older than 6× the threshold, or no observation at all
 *   error    – the latest request for this station failed (any data shown is older)
 */
export type Freshness = "live" | "stale" | "offline" | "error";

export function classifyFreshness(ageMinutes: number | null, staleAfterMinutes: number, hasError = false): Freshness {
  if (ageMinutes === null) return hasError ? "error" : "offline";
  if (hasError) return "error";
  if (ageMinutes <= staleAfterMinutes) return "live";
  if (ageMinutes <= staleAfterMinutes * 6) return "stale";
  return "offline";
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  live: "Reporting",
  stale: "Stale",
  offline: "Offline",
  error: "Error",
};
