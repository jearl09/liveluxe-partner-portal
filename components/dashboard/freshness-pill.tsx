import type { Freshness } from "@/lib/domain/dashboard";
import { cn } from "@/lib/utils";

/** Availability freshness: green when recent, amber when stale. Trust comes from showing this. */
export function FreshnessPill({ freshness }: { freshness: Freshness }) {
  const stale = freshness.state !== "fresh";
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
        stale ? "border-warn-border bg-warn-bg text-warn" : "border-border text-foreground bg-card",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", stale ? "bg-warn" : "bg-ok")} aria-hidden />
      {freshness.label}
    </span>
  );
}
