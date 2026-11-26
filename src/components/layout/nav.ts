import type { LucideIcon } from "lucide-react";
import type { ProviderType } from "@/lib/integrations/contracts";
import { Activity, AlertTriangle, BarChart3, Cpu, Database, Gauge, History, LayoutDashboard, Map, Radio, Settings, Waves, Sun, Thermometer } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  provider?: ProviderType;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/live", label: "Live Monitoring", icon: Radio },
      { href: "/stations", label: "Stations & Devices", icon: Cpu },
      { href: "/map", label: "Map View", icon: Map },
      { href: "/alerts", label: "Alerts", icon: AlertTriangle },
    ],
  },
  {
    section: "Analyse",
    items: [
      { href: "/analytics", label: "Environmental Analytics", icon: BarChart3 },
      { href: "/historical", label: "Historical Data", icon: History },
      { href: "/explorer", label: "Data Explorer", icon: Database },
    ],
  },
  {
    section: "Sources",
    items: [
      { href: "/obscape", label: "Obscape", icon: Waves, provider: "OBSCAPE" },
      { href: "/licor", label: "LI-COR Cloud", icon: Thermometer, provider: "LICOR" },
      { href: "/ecowitt", label: "Ecowitt", icon: Sun, provider: "ECOWITT" },
    ],
  },
  {
    section: "System",
    items: [
      { href: "/integrations", label: "Integration Health", icon: Activity },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV: NavItem[] = NAV.flatMap((s) => s.items);
export function titleFor(pathname: string) {
  if (pathname.startsWith("/stations/")) return "Station detail";
  return ALL_NAV.find((i) => i.href === pathname)?.label ?? "Overview";
}
export { Gauge };
