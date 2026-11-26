import Image from "next/image";
import { cn } from "@/lib/utils";

/** SmithWarner wordmark — white plate so it stays readable on dark surfaces. */
export function BrandLogo({
  className,
  priority,
  size = "md",
}: {
  className?: string;
  priority?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "lg" ? { width: 280, height: 84 } : size === "sm" ? { width: 160, height: 48 } : { width: 200, height: 60 };
  return (
    <span className={cn("inline-flex items-center justify-center rounded-lg bg-white p-2", className)}>
      <Image
        src="/smithwarner-logo.jpg"
        alt="SmithWarner"
        width={dims.width}
        height={dims.height}
        className="h-auto w-full object-contain"
        priority={priority}
      />
    </span>
  );
}
