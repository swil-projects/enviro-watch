import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...p} />;
}
export function CardHeader({ className, title, description, action, icon }: { className?: string; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-text-3">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-text">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-text-3">{description}</p>}
        </div>
      </div>
      {action && <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
export function CardBody({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("p-4 sm:p-5", className)} {...p} />;
}
