import { cn } from "@/lib/utils";

const control = "h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-text shadow-sm outline-none transition-colors hover:border-border-strong focus-visible:border-ring disabled:opacity-50";

export function Select({ className, ...p }: React.ComponentProps<"select">) {
  return <select className={cn(control, "pr-7", className)} {...p} />;
}
export function Input({ className, ...p }: React.ComponentProps<"input">) {
  return <input className={cn(control, "placeholder:text-text-3", className)} {...p} />;
}
export function Label({ className, ...p }: React.ComponentProps<"label">) {
  return <label className={cn("flex flex-col gap-1 text-xs font-medium text-text-2", className)} {...p} />;
}
