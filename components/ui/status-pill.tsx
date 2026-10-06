import { STATUS_LABELS, statusTone, type PillTone } from "@/lib/domain/dashboard";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import { cn } from "@/lib/utils";

const TONES: Record<PillTone, string> = {
  "navy-outline": "border-navy-900/40 text-navy-900 bg-white",
  gold: "border-gold-500 text-gold-600 bg-white",
  "gold-filled": "border-gold-500 bg-gold-500 text-white",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  muted: "border-cream-300 bg-cream-100 text-ink-500",
  red: "border-red-200 bg-red-50 text-red-800",
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
