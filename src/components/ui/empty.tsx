import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, children, className }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center", className)}>
      {icon && <div className="text-text-3 [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-medium text-text">{title}</p>
      {children && <div className="max-w-md text-xs text-text-3">{children}</div>}
    </div>
  );
}
