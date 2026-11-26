import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-neutral-soft text-text-2 border-border",
  accent: "bg-accent-soft text-accent-text border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  serious: "bg-serious-soft text-serious border-transparent",
  critical: "bg-critical-soft text-critical border-transparent",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...p }: React.ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 [&_svg]:size-3", tones[tone], className)} {...p} />;
}
