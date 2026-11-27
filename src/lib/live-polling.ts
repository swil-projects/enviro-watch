"use client";
import { focusManager } from "@tanstack/react-query";

/**
 * Live polling only runs while someone is actually looking at the dashboard.
 *
 * React Query's interval refetches are skipped whenever its focusManager reports
 * "not focused" (refetchIntervalInBackground is left at its default of false). Out of
 * the box that only tracks tab visibility, so a visible-but-unfocused window (another
 * app in front, a second monitor) kept polling the API. Here "focused" means the tab is
 * visible AND the browser window has focus.
 *
 * When focus returns, React Query refetches any stale query that opted in via
 * {@link livePolling}, so the live feed wakes up immediately instead of waiting for the
 * next interval tick; the interval then restarts from that fetch.
 */
export function installFocusTracking(): void {
  focusManager.setEventListener((setFocused) => {
    if (typeof window === "undefined") return;
    const update = (e?: Event) => setFocused(e?.type === "blur" ? false : document.visibilityState === "visible" && document.hasFocus());
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  });
}

/**
 * Query options for data that refreshes on an interval while the user is on the page.
 * Pass `false` to disable polling (e.g. paused, or a fixed custom range); that also
 * disables the refresh-on-return.
 */
export function livePolling(intervalMs: number | false) {
  return { refetchInterval: intervalMs, refetchOnWindowFocus: intervalMs !== false } as const;
}
