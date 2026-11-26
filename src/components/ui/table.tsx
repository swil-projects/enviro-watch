import { cn } from "@/lib/utils";

export function TableWrap({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("w-full overflow-x-auto", className)} {...p} />;
}
export function Table({ className, ...p }: React.ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...p} />;
}
export function Th({ className, ...p }: React.ComponentProps<"th">) {
  return <th className={cn("whitespace-nowrap border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-3", className)} {...p} />;
}
export function Td({ className, ...p }: React.ComponentProps<"td">) {
  return <td className={cn("border-b border-border/70 px-3 py-2.5 align-middle text-text-2", className)} {...p} />;
}
