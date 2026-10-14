/**
 * Step tracker model (brief §13 rule 4) and availability-freshness model (brief §4.6
 * SyncState). Pure: no Intl, no framework.
 *
 *   Submitted → Live Luxe reviewing → Approved → Confirmed → Check-in details sent
 */
import type { BookingStatus } from "./booking-state-machine";

export const PROGRESS_STEPS = [
  "Submitted",
  "Live Luxe reviewing",
  "Approved",
  "Confirmed",
  "Check-in details sent",
] as const;

export type StepState = "done" | "current" | "upcoming" | "stopped";

export interface ProgressModel {
  steps: { label: (typeof PROGRESS_STEPS)[number]; state: StepState }[];
  /** Set when the request ended before the last step: the word shown at the step where it stopped. */
  outcome: "Declined" | "Expired" | "Cancelled" | "Failed" | null;
  /** One plain sentence on who acts next, without dates (the caller adds the deadline). */
  waitingOn: "partner" | "livluxe" | "system" | null;
}

/** Index of the step that is happening now (or would have happened next). */
function currentIndex(status: BookingStatus, checkinReleased: boolean): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "COUNTER_OFFERED":
      return 1;
    case "APPROVED":
    case "AWAITING_PAYMENT":
      return 3;
    case "CONFIRMED":
      return checkinReleased ? 5 : 4;
    case "CHECKED_IN":
    case "COMPLETED":
      return 5;
    default:
      return 1;
  }
}

/**
 * Where a request is in its life. Terminal outcomes (declined, expired, cancelled,
 * failed) mark the step they stopped at as `stopped` and everything after it upcoming.
 * `reachedIndex` for outcomes is the furthest step the request had got to, taken from
 * whether it was ever approved / confirmed (the caller passes it from the history).
 */
export function requestProgress(input: {
  status: BookingStatus;
  checkinReleased?: boolean;
  /** For terminal statuses: the furthest live status the request reached before it ended. */
  reachedBeforeEnd?: BookingStatus | null;
}): ProgressModel {
  const { status } = input;
  const ended =
    status === "DECLINED" || status === "EXPIRED" || status === "CANCELLED" || status === "FAILED"
      ? ({ DECLINED: "Declined", EXPIRED: "Expired", CANCELLED: "Cancelled", FAILED: "Failed" } as const)[status]
      : null;

  if (ended) {
    const reached = input.reachedBeforeEnd ? currentIndex(input.reachedBeforeEnd, false) : 1;
    const stopAt = Math.min(reached, PROGRESS_STEPS.length - 1);
    return {
      steps: PROGRESS_STEPS.map((label, i) => ({
        label,
        state: i < stopAt ? "done" : i === stopAt ? "stopped" : "upcoming",
      })),
      outcome: ended,
      waitingOn: ended === "Failed" ? "livluxe" : null,
    };
  }

  const at = currentIndex(status, !!input.checkinReleased);
  const waitingOn: ProgressModel["waitingOn"] =
    status === "COUNTER_OFFERED" || status === "AWAITING_PAYMENT" || status === "DRAFT"
      ? "partner"
      : status === "SUBMITTED" || status === "UNDER_REVIEW"
        ? "livluxe"
        : status === "APPROVED" || (status === "CONFIRMED" && !input.checkinReleased)
          ? "system"
          : null;
  return {
    steps: PROGRESS_STEPS.map((label, i) => ({ label, state: i < at ? "done" : i === at ? "current" : "upcoming" })),
    outcome: null,
    waitingOn,
  };
}

// ---------------------------------------------------------------------------
// Availability freshness (SyncState)
// ---------------------------------------------------------------------------

export type SyncLevel = "live" | "delayed" | "degraded" | "unknown";

export interface SyncModel {
  level: SyncLevel;
  /** When availability was last confirmed from Hostaway, or null when never. */
  lastConfirmedAt: string | null;
  /** Minutes since the last confirmation, rounded down; null when never. */
  ageMinutes: number | null;
}

export function syncState(input: {
  lastSyncIso: string | null;
  now: Date;
  staleAfterMinutes: number;
  /** True when the Hostaway circuit breaker is open: we are serving cached data. */
  degraded?: boolean;
}): SyncModel {
  if (!input.lastSyncIso)
    return { level: input.degraded ? "degraded" : "unknown", lastConfirmedAt: null, ageMinutes: null };
  const ageMs = Math.max(0, input.now.getTime() - new Date(input.lastSyncIso).getTime());
  const ageMinutes = Math.floor(ageMs / 60_000);
  const level: SyncLevel = input.degraded ? "degraded" : ageMinutes > input.staleAfterMinutes ? "delayed" : "live";
  return { level, lastConfirmedAt: input.lastSyncIso, ageMinutes };
}

/** "just now", "3 min ago", "2 h ago" — for the live state only; delayed states show the clock time. */
export function ageLabel(ageMinutes: number): string {
  if (ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const h = Math.floor(ageMinutes / 60);
  return `${h} h ago`;
}
