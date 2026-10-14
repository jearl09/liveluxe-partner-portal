import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import { slaBadge } from "@/lib/domain/status";
import { cn, formatTimestamp } from "@/lib/utils";
import { STATUS_TONE_CLASSES, pillClass } from "./status-pill";

/**
 * The decision-SLA badge (brief §4.6). Renders nothing unless the clock is running
 * (Submitted, Under review) or a counter-offer has paused it; never on approved,
 * declined, cancelled or expired rows, where it would carry no information.
 */
export function SlaBadge({
  status,
  submittedAt,
  decisionDueAt,
  pausedAt,
  now = new Date(),
  className,
}: {
  status: BookingStatus;
  submittedAt: string | null;
  decisionDueAt: string | null;
  pausedAt?: string | null;
  now?: Date;
  className?: string;
}) {
  const badge = slaBadge({
    status,
    submittedAt,
    decisionDueAt,
    pausedAt,
    now,
    formatPausedAt: (iso) => formatTimestamp(iso).replace(/^.*?, /, ""),
  });
  if (!badge) return null;
  const title = decisionDueAt ? `Decision due ${formatTimestamp(decisionDueAt)}` : undefined;
  return (
    <span
      className={cn(pillClass, "tabular-nums", STATUS_TONE_CLASSES[badge.tone], className)}
      title={title}
      data-sla={badge.band}
    >
      {badge.label}
    </span>
  );
}
