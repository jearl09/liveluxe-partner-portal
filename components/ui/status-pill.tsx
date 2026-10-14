import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import { STATUS_LABELS, statusTone, type StatusTone } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

/** Tone → role classes. The word carries the meaning; the tint reinforces it (brief §4.1, §4.6). */
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-subtle bg-inset text-text-secondary",
  info: "border-info-border bg-info-bg text-info-fg",
  attention: "border-attention-border bg-attention-bg text-attention-fg",
  success: "border-success-border bg-success-bg text-success-fg",
  "success-soft": "border-success-border bg-surface text-success-fg",
  muted: "border-muted-border bg-muted-bg text-muted-fg",
  danger: "border-danger-border bg-danger-bg text-danger-fg",
};

export const pillClass =
  "inline-flex items-center rounded-pill border px-2.5 py-0.5 text-body-sm font-semibold whitespace-nowrap";

/**
 * The one booking-status pill (brief §4.6). Takes a status code and renders the
 * §2.3 label and tone; no screen renders its own.
 */
export function StatusPill({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <span className={cn(pillClass, STATUS_TONE_CLASSES[statusTone(status)], className)} data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}
