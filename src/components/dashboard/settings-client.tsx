"use client";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { setTimezone, useTimezone } from "@/components/providers/timezone";

const ZONES = ["America/Jamaica", "UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Amsterdam", "Asia/Shanghai", "Australia/Sydney"];

export function DisplaySettings({ defaultTz }: { defaultTz: string }) {
  const tz = useTimezone();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const zones = [...new Set([defaultTz, ...ZONES, tz])];
  return (
    <Card>
      <CardHeader title="Display preferences" description="Stored in this browser only." />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-text-2">
          Time zone for displayed times
          <Select value={tz} onChange={(e) => setTimezone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
                {z === defaultTz ? " (server default)" : ""}
              </option>
            ))}
          </Select>
          <span className="font-normal text-text-3">All timestamps are handled in UTC internally; this only changes how they are shown.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-text-2">
          Theme
          <Select value={mounted ? theme : "dark"} onChange={(e) => setTheme(e.target.value)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </Select>
        </label>
      </CardBody>
    </Card>
  );
}
