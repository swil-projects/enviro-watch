"use client";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Display time-zone preference. Observations are always stored/transported in UTC;
 * this only affects rendering. Default comes from APP_TIMEZONE (runtime), the user's
 * choice is remembered per-browser.
 */
const KEY = "em.timezone";
let serverDefault = "America/Jamaica";
let current: string | null = null;
const listeners = new Set<() => void>();

function read(): string {
  if (current) return current;
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (v) return (current = v);
  } catch {}
  return serverDefault;
}

export function setTimezone(tz: string) {
  current = tz;
  try {
    window.localStorage.setItem(KEY, tz);
  } catch {}
  listeners.forEach((l) => l());
}

export function useTimezone(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => serverDefault,
  );
}

/** Rendered by the server with the runtime APP_TIMEZONE. */
export function TimezoneDefault({ tz }: { tz: string }) {
  useEffect(() => {
    if (serverDefault !== tz) {
      serverDefault = tz;
      listeners.forEach((l) => l());
    }
  }, [tz]);
  return null;
}
