"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { NAV } from "./nav";
import { ProviderDot } from "@/components/dashboard/status";
import { cn } from "@/lib/utils";

function ActiveSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return <SidebarContent pathname={usePathname()} onNavigate={onNavigate} />;
}

export function SidebarContent({ onNavigate, pathname }: { onNavigate?: () => void; pathname: string }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-3 pr-10 lg:pr-3">
        <Link href="/" onClick={onNavigate} className="block" aria-label="SmithWarner — EnviroWatch home">
          <BrandLogo size="sm" className="w-full" />
        </Link>
        <p className="mt-2 truncate px-0.5 text-[11px] text-text-3">EnviroWatch · Unified monitoring</p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="px-2 pb-1.5 text-xs font-medium text-text-3">{group.section}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors",
                        active ? "bg-accent-soft font-medium text-accent-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-accent-text" : "text-text-3 group-hover:text-text-2")} aria-hidden />
                      <span className="truncate">{item.label}</span>
                      {item.provider && <ProviderDot provider={item.provider} className="ml-auto" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-t border-border px-4 py-3 text-[11px] text-text-3">EnviroWatch · Smith Warner</p>
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-surface lg:block">
      <Suspense fallback={<SidebarContent pathname="" />}>
        <ActiveSidebarContent />
      </Suspense>
    </aside>
  );
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1100] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <button aria-label="Close navigation" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface shadow-xl">
        <button onClick={onClose} aria-label="Close navigation" className="absolute right-2 top-3 z-10 rounded-md p-1.5 text-text-3 hover:bg-surface-2">
          <X className="size-4" />
        </button>
        <ActiveSidebarContent onNavigate={onClose} />
      </div>
    </div>
  );
}
