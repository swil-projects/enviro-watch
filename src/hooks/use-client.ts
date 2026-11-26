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
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 15_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time, refreshed every 15 s; null during SSR (render a stable fallback). */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => now || Date.now(), () => null);
}
