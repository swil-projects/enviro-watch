"use client";
import { useState } from "react";
import { useMounted, useNow } from "@/hooks/use-client";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { livePolling } from "@/lib/live-polling";
import { useTheme } from "next-themes";
import { LogOut, Menu, Moon, RefreshCw, Search, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MobileSidebar } from "./sidebar";
import { titleFor } from "./nav";
import { TimeAgo } from "@/components/dashboard/status";
import { useTimezone } from "@/components/providers/timezone";
import { apiGet, apiSend } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import type { ProviderSummary } from "@/lib/overview";

function Clock() {
  const tz = useTimezone();
  const now = useNow();
  return (
    <span className="tabular hidden text-xs text-text-3 xl:inline" title={tz}>
      {now ? formatDateTime(now, tz, "EEE d MMM, HH:mm") : "—"} <span className="text-text-3/70">{tz.split("/").pop()?.replace("_", " ")}</span>
    </span>
  );
}

export function HeaderFallback() {
  return <div className="sticky top-0 z-[1000] h-14 border-b border-border bg-surface/85" aria-hidden />;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const mounted = useMounted();

  const status = useQuery({ queryKey: ["providers-status"], queryFn: () => apiGet<ProviderSummary[]>("/api/providers/status"), ...livePolling(60_000) });
  const lastSuccess = status.data?.map((p) => p.lastSuccessAt).filter(Boolean).sort().at(-1) ?? null;

  const refresh = useMutation({
    mutationFn: () => apiSend("/api/refresh", "POST"),
    onSuccess: () => {
      toast.success("Data refreshed from providers");
      qc.invalidateQueries();
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [q, setQ] = useState("");
  return (
    <>
      <header className="sticky top-0 z-[1000] flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/70 sm:px-6">
        <button className="rounded-md p-1.5 text-text-2 hover:bg-surface-2 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{titleFor(pathname)}</h1>
        </div>
        <form
          role="search"
          className="relative hidden md:block"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/stations?q=${encodeURIComponent(q)}`);
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-3" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stations…" aria-label="Search stations" className="h-8 w-52 rounded-lg border border-border bg-surface-2 pl-8 pr-2 text-sm outline-none placeholder:text-text-3 focus-visible:border-ring" />
        </form>
        <Clock />
        <span className="hidden text-xs text-text-3 sm:inline">
          Synced <TimeAgo iso={lastSuccess} className="text-text-2" />
        </span>
        <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending} aria-label="Refresh data from providers">
          <RefreshCw className={refresh.isPending ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{refresh.isPending ? "Refreshing" : "Refresh"}</span>
        </Button>
        <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {mounted && resolvedTheme === "light" ? <Moon /> : <Sun />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.assign("/login");
          }}
        >
          <LogOut />
        </Button>
      </header>
      <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
