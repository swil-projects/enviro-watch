import { Suspense } from "react";
import { connection } from "next/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header, HeaderFallback } from "@/components/layout/header";
import { TimezoneDefault } from "@/components/providers/timezone";
import { getEnv } from "@/lib/env";
import { authMode } from "@/lib/auth/session";
import { FlaskConical, ShieldAlert } from "lucide-react";

/** Runtime banners: demo mode / auth status are read from the environment at request time. */
async function RuntimeBanners() {
  await connection();
  const env = getEnv();
  const mode = authMode();
  return (
    <>
      <TimezoneDefault tz={env.appTimezone} />
      {env.demoMode && (
        <div role="status" className="flex items-center gap-2 border-b border-serious/30 bg-serious-soft px-4 py-2 text-xs font-medium text-serious sm:px-6">
          <FlaskConical className="size-4 shrink-0" aria-hidden />
          DEMO MODE — all readings on this page are synthetic and are not real measurements. Set DEMO_MODE=false to use the live provider APIs.
        </div>
      )}
      {mode === "open-dev" && (
        <div role="status" className="flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-xs text-warn sm:px-6">
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          Authentication is disabled — anyone who can reach this server can use it. Set AUTH_SECRET, AUTH_USERNAME and AUTH_PASSWORD (and remove AUTH_DISABLED) before deploying.
        </div>
      )}
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[2000] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<HeaderFallback />}>
          <Header />
        </Suspense>
        <Suspense fallback={null}>
          <RuntimeBanners />
        </Suspense>
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
