"use client";
/** Fixed categorical order (validated palette). Colour follows the entity, not its rank. */
export const SERIES_VARS = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6", "--series-7", "--series-8"];

export function cssVar(name: string, fallback = "#888") {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Stable colour slot for an entity id within a stable universe of ids. */
export function colorSlot(id: string, universe: string[]): number {
  const sorted = [...new Set(universe)].sort();
  const i = sorted.indexOf(id);
  return i < 0 ? 0 : i % SERIES_VARS.length;
}
