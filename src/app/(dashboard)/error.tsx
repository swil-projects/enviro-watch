"use client";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-text-3">The page failed to render. Provider failures are normally shown inline, so this is likely an application error.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
