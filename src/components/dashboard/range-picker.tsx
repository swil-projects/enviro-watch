"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type RangeValue = { range: "1h" | "6h" | "24h" | "7d" | "30d" | "custom"; start?: string; end?: string };
const PRESETS: { v: RangeValue["range"]; label: string }[] = [
  { v: "1h", label: "1H" },
  { v: "6h", label: "6H" },
  { v: "24h", label: "24H" },
  { v: "7d", label: "7D" },
  { v: "30d", label: "30D" },
  { v: "custom", label: "Custom" },
];

export function rangeToQuery(r: RangeValue): string {
  if (r.range === "custom" && r.start && r.end) return `range=custom&start=${encodeURIComponent(r.start)}&end=${encodeURIComponent(r.end)}`;
  return `range=${r.range === "custom" ? "24h" : r.range}`;
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function RangePicker({ value, onChange, presets }: { value: RangeValue; onChange: (v: RangeValue) => void; presets?: RangeValue["range"][] }) {
  const [draft, setDraft] = useState(() => ({ start: toLocalInput(new Date(Date.now() - 3 * 86_400_000)), end: toLocalInput(new Date()) }));
  const startMs = Date.parse(draft.start);
  const endMs = Date.parse(draft.end);
  const valid = Number.isFinite(startMs) && Number.isFinite(endMs) && startMs < endMs;
  const list = presets ? PRESETS.filter((p) => presets.includes(p.v)) : PRESETS;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
        {list.map((p) => (
          <button
            key={p.v}
            role="radio"
            aria-checked={value.range === p.v}
            onClick={() => (p.v === "custom" ? valid && onChange({ range: "custom", start: new Date(draft.start).toISOString(), end: new Date(draft.end).toISOString() }) : onChange({ range: p.v }))}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", value.range === p.v ? "bg-surface text-text shadow-sm" : "text-text-3 hover:text-text")}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.range === "custom" && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-3">
          <input type="datetime-local" aria-label="Start (browser local time)" value={draft.start} max={draft.end} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} className="h-8 rounded-md border border-border bg-surface px-2 text-text" />
          <span>→</span>
          <input type="datetime-local" aria-label="End (browser local time)" value={draft.end} min={draft.start} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} className="h-8 rounded-md border border-border bg-surface px-2 text-text" />
          <button disabled={!valid} className="h-8 rounded-md border border-border bg-surface-2 px-2.5 font-medium text-text hover:bg-surface-3 disabled:opacity-40" onClick={() => valid && onChange({ range: "custom", start: new Date(draft.start).toISOString(), end: new Date(draft.end).toISOString() })}>
            Apply
          </button>
          {!valid && <p role="status" className="w-full text-warn">Choose valid dates with the end after the start.</p>}
        </div>
      )}
    </div>
  );
}
