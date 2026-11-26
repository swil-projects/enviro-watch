import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:brightness-110 dark:text-[#04222a]",
        secondary: "border border-border bg-surface-2 text-text hover:bg-surface-3",
        ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
        danger: "border border-critical/40 bg-critical-soft text-critical hover:brightness-110",
      },
      size: { sm: "h-8 px-2.5 text-xs", md: "h-9 px-3.5", icon: "size-9" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({ className, variant, size, ...p }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...p} />;
}
