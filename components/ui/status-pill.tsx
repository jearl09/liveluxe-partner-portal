import { STATUS_LABELS, statusTone, type PillTone } from "@/lib/domain/dashboard";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import { cn } from "@/lib/utils";

const TONES: Record<PillTone, string> = {
  "navy-outline": "border-primary/40 text-strong bg-card",
  gold: "border-accent text-accent-ink bg-card",
  "gold-filled": "border-accent bg-accent text-accent-foreground",
  green: "border-ok-border bg-ok-bg text-ok",
  muted: "border-input bg-muted text-muted-foreground",
  red: "border-bad-border bg-bad-bg text-bad",
};

/** Booking status pill — the one mapping used everywhere (§10 states, §13.5: never colour alone). */
export function StatusPill({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[statusTone(status)],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
