"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** true after hydration on the client, false during SSR. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

// One shared ticking clock for all components.
const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;
function tick() {
  now = Date.now();
  listeners.forEach((l) => l());
}
// Tick straight away when the user comes back, so "x min ago" labels are current
// alongside the live data that refetches at the same moment.
function onReturn() {
  if (document.visibilityState === "visible") tick();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    }
  };
}

/** Current time, refreshed every 15 s; null during SSR (render a stable fallback). */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => now || Date.now(), () => null);
}
