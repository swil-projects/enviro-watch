"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { livePolling } from "@/lib/live-polling";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BellRing, History, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/field";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { AlertList, SEVERITY } from "./alert-list";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { apiGet, apiSend } from "@/lib/fetcher";
import { PROVIDERS, PROVIDER_META } from "@/lib/integrations/contracts";
import type { AlertEvent, AlertRule } from "@/lib/alerts";
import type { MetricOption } from "./timeseries-panel";

interface AlertsData {
  rules: AlertRule[];
  rulesError?: string;
  active: AlertEvent[];
  history: AlertEvent[];
}

const FormSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,64}$/, "3–64 chars: lowercase letters, digits, hyphens"),
    name: z.string().min(1, "Required").max(120),
    enabled: z.boolean(),
    severity: z.enum(["info", "warning", "critical"]),
    type: z.enum(["threshold_above", "threshold_below", "station_stale", "integration_failure"]),
    metricKey: z.string().optional(),
    provider: z.string().optional(),
    stationId: z.string().optional(),
    threshold: z.string().optional(),
    staleMinutes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type.startsWith("threshold")) {
      if (!v.metricKey) ctx.addIssue({ code: "custom", path: ["metricKey"], message: "Choose a measurement" });
      if (!v.threshold || !Number.isFinite(Number(v.threshold))) ctx.addIssue({ code: "custom", path: ["threshold"], message: "Enter a number" });
    }
    if (v.type === "station_stale" && !(Number(v.staleMinutes) >= 5)) ctx.addIssue({ code: "custom", path: ["staleMinutes"], message: "≥ 5 minutes" });
  });
type FormValues = z.infer<typeof FormSchema>;

const TYPE_LABEL: Record<AlertRule["type"], string> = {
  threshold_above: "Measurement above threshold",
  threshold_below: "Measurement below threshold",
  station_stale: "Station stops reporting",
  integration_failure: "Integration failure",
};

function toForm(r?: AlertRule): FormValues {
  return {
    id: r?.id ?? "",
    name: r?.name ?? "",
    enabled: r?.enabled ?? true,
    severity: r?.severity ?? "warning",
    type: r?.type ?? "threshold_above",
    metricKey: r?.metricKey ?? "",
    provider: r?.provider ?? "",
    stationId: r?.stationId ?? "",
    threshold: r?.threshold?.toString() ?? "",
    staleMinutes: r?.staleMinutes?.toString() ?? "120",
  };
}

function toRule(v: FormValues): AlertRule {
  return {
    id: v.id,
    name: v.name,
    enabled: v.enabled,
    severity: v.severity,
    type: v.type,
    metricKey: v.type.startsWith("threshold") ? v.metricKey || undefined : undefined,
    provider: (v.provider || undefined) as AlertRule["provider"],
    stationId: v.stationId || undefined,
    threshold: v.type.startsWith("threshold") ? Number(v.threshold) : undefined,
    staleMinutes: v.type === "station_stale" ? Number(v.staleMinutes) : undefined,
  };
}

export function AlertsClient({ initial, metrics, stations }: { initial: AlertsData; metrics: MetricOption[]; stations: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({ queryKey: ["alerts"], queryFn: () => apiGet<AlertsData>("/api/alerts"), initialData: initial, ...livePolling(60_000) });
  const [editing, setEditing] = useState<AlertRule | null | "new">(null);
  const rulesPg = usePagination(data.rules, 10);

  const del = useMutation({
    mutationFn: (id: string) => apiSend(`/api/alerts/rules?id=${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => {
      toast.success("Rule deleted");
      qc.invalidateQueries({ queryKey: ["alerts"] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Active alerts (${data.active.length})`} description="Evaluated against the current unified snapshot. One alert per unresolved condition." icon={<BellRing className="size-4" />} />
          <CardBody className="py-1">
            <AlertList alerts={data.active} pageSize={8} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recently resolved" description="Kept in server memory (resets on restart — no database)." icon={<History className="size-4" />} />
          <CardBody className="py-1">
            <AlertList alerts={data.history} empty="No resolved alerts since the server started" pageSize={8} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Alert rules"
          description="Stored in config/alert-rules.json."
          icon={<Settings2 className="size-4" />}
          action={
            <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
              <Plus /> New rule
            </Button>
          }
        />
        {data.rulesError && <p className="border-b border-border bg-critical-soft px-5 py-2 text-xs text-critical">{data.rulesError}</p>}
        {editing && <RuleForm key={editing === "new" ? "new" : editing.id} rule={editing === "new" ? undefined : editing} metrics={metrics} stations={stations} existingIds={data.rules.map((r) => r.id)} onDone={() => setEditing(null)} />}
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Rule</Th>
                <Th>Type</Th>
                <Th>Condition</Th>
                <Th>Scope</Th>
                <Th>Severity</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rulesPg.pageItems.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <p className="text-text">{r.name}</p>
                    <code className="font-mono text-[11px] text-text-3">{r.id}</code>
                  </Td>
                  <Td>{TYPE_LABEL[r.type]}</Td>
                  <Td className="text-xs">
                    {r.type.startsWith("threshold") ? `${metrics.find((m) => m.key === r.metricKey)?.label ?? r.metricKey} ${r.type === "threshold_above" ? ">" : "<"} ${r.threshold}` : r.type === "station_stale" ? `no data > ${r.staleMinutes} min` : "any provider error"}
                  </Td>
                  <Td className="text-xs">{[r.provider && PROVIDER_META[r.provider].name, r.stationId && (stations.find((s) => s.id === r.stationId)?.name ?? r.stationId)].filter(Boolean).join(" · ") || "All"}</Td>
                  <Td>
                    <Badge tone={SEVERITY[r.severity].tone}>
                      {SEVERITY[r.severity].icon}
                      {SEVERITY[r.severity].label}
                    </Badge>
                  </Td>
                  <Td>{r.enabled ? <Badge tone="good">Enabled</Badge> : <Badge>Disabled</Badge>}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                      <Pencil />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => confirm(`Delete rule “${r.name}”?`) && del.mutate(r.id)}>
                      <Trash2 />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <Pagination {...rulesPg} onPage={rulesPg.setPage} onPageSize={rulesPg.setPageSize} pageSizes={[10, 25, 50]} label="rules" className="border-t border-border px-5 py-2.5" />
      </Card>
    </div>
  );
}

function RuleForm({ rule, metrics, stations, existingIds, onDone }: { rule?: AlertRule; metrics: MetricOption[]; stations: { id: string; name: string }[]; existingIds: string[]; onDone: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const form = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: toForm(rule) });
  const type = form.watch("type");
  const save = useMutation({
    mutationFn: (v: FormValues) => apiSend("/api/alerts/rules", "POST", toRule(v)),
    onSuccess: () => {
      toast.success("Rule saved");
      qc.invalidateQueries({ queryKey: ["alerts"] });
      router.refresh();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const err = form.formState.errors;
  return (
    <form
      onSubmit={form.handleSubmit((v) => {
        if (!rule && existingIds.includes(v.id)) return form.setError("id", { message: "Id already exists" });
        save.mutate(v);
      })}
      className="grid gap-3 border-b border-border bg-surface-2/50 px-5 py-4 md:grid-cols-4"
      aria-label={rule ? "Edit rule" : "New rule"}
    >
      <Label>
        Rule id
        <Input {...form.register("id")} disabled={Boolean(rule)} placeholder="e.g. high-water-level" aria-invalid={Boolean(err.id)} />
        {err.id && <span className="text-critical">{err.id.message}</span>}
      </Label>
      <Label className="md:col-span-2">
        Name
        <Input {...form.register("name")} aria-invalid={Boolean(err.name)} />
        {err.name && <span className="text-critical">{err.name.message}</span>}
      </Label>
      <Label>
        Severity
        <Select {...form.register("severity")}>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </Select>
      </Label>
      <Label>
        Type
        <Select {...form.register("type")}>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </Label>
      {type.startsWith("threshold") && (
        <>
          <Label>
            Measurement
            <Select {...form.register("metricKey")}>
              <option value="">Choose…</option>
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </Select>
            {err.metricKey && <span className="text-critical">{err.metricKey.message}</span>}
          </Label>
          <Label>
            Threshold (canonical unit)
            <Input inputMode="decimal" {...form.register("threshold")} />
            {err.threshold && <span className="text-critical">{err.threshold.message}</span>}
          </Label>
        </>
      )}
      {type === "station_stale" && (
        <Label>
          No data for (minutes)
          <Input inputMode="numeric" {...form.register("staleMinutes")} />
          {err.staleMinutes && <span className="text-critical">{err.staleMinutes.message}</span>}
        </Label>
      )}
      <Label>
        Provider
        <Select {...form.register("provider")}>
          <option value="">All</option>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{PROVIDER_META[p].name}</option>
          ))}
        </Select>
      </Label>
      {type !== "integration_failure" && (
        <Label>
          Station
          <Select {...form.register("stationId")}>
            <option value="">All</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Label>
      )}
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-2">
        <input type="checkbox" {...form.register("enabled")} className="size-4 accent-[var(--accent)]" /> Enabled
      </label>
      <div className="flex items-end justify-end gap-2 md:col-span-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          <X /> Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save rule"}
        </Button>
      </div>
    </form>
  );
}
