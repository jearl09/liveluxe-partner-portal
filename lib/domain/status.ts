/**
 * The one status vocabulary (brief §2.3, §4.6) and the SLA badge model.
 *
 * Every pill in both apps renders from `STATUS_LABELS` and `statusTone`; nothing
 * else may invent a label or a colour for a booking state. Declined, Expired and
 * Cancelled are outcomes, not alarms (muted); danger is reserved for Failed and for
 * a breached SLA on a live request.
 */
import type { BookingStatus } from "./booking-state-machine";
import { slaBand, type SlaBand } from "./requests";

export const STATUS_LABELS: Record<BookingStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  COUNTER_OFFERED: "Counter-offer",
  APPROVED: "Approved",
  AWAITING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
};

/** The five tones of brief §4.1 plus `neutral` (no tint) and `success-soft` (approved: outlined, not filled). */
export type StatusTone = "neutral" | "info" | "attention" | "success" | "success-soft" | "muted" | "danger";

export function statusTone(status: BookingStatus): StatusTone {
  switch (status) {
    case "DRAFT":
    case "COMPLETED":
      return "neutral";
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "info";
    case "COUNTER_OFFERED":
    case "AWAITING_PAYMENT":
      return "attention";
    case "APPROVED":
      return "success-soft";
    case "CONFIRMED":
    case "CHECKED_IN":
      return "success";
    case "DECLINED":
    case "EXPIRED":
    case "CANCELLED":
      return "muted";
    case "FAILED":
      return "danger";
  }
}

/** "request" up to and including Approved / Awaiting payment; "booking" from Confirmed onward (brief §2.3). */
export function nounFor(status: BookingStatus): "request" | "booking" {
  switch (status) {
    case "CONFIRMED":
    case "CHECKED_IN":
    case "COMPLETED":
      return "booking";
    default:
      return "request";
  }
}

/** Statuses whose decision clock is running. The SLA badge renders for these and for a paused counter-offer only. */
export const SLA_RUNNING: readonly BookingStatus[] = ["SUBMITTED", "UNDER_REVIEW"];

/** Durations as `1 h 20 m`, `1 d 2 h`, `40 m`: units separated by spaces, two units at most (brief §11.1). */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(Math.abs(ms) / 60_000));
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d >= 1) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h >= 1) return m > 0 ? `${h} h ${m} m` : `${h} h`;
  return `${Math.max(m, 1)} m`;
}

export interface SlaBadgeModel {
  tone: "info" | "attention" | "danger" | "muted";
  label: string;
  band: SlaBand;
}

/**
 * What the SLA badge shows, or null when it must not render (clock not running).
 *   on track  → "Due in 2 h 10 m" (info)
 *   at risk   → "Due in 40 m" (attention)
 *   breached  → "Overdue by 1 d 2 h" (danger)
 *   paused    → "Waiting on partner since 11:40 am AEDT" (muted) — only on a counter-offer
 */
export function slaBadge(input: {
  status: BookingStatus;
  submittedAt: string | null;
  decisionDueAt: string | null;
  pausedAt?: string | null;
  now: Date;
  /** Formats the pause instant for the label; injected so this module stays free of Intl locale choices. */
  formatPausedAt?: (iso: string) => string;
  atRiskPct?: number;
}): SlaBadgeModel | null {
  const paused = !!input.pausedAt;
  if (input.status === "COUNTER_OFFERED" && paused) {
    const when = input.formatPausedAt ? input.formatPausedAt(input.pausedAt!) : null;
    return { tone: "muted", label: when ? `Waiting on partner since ${when}` : "Waiting on partner", band: "paused" };
  }
  if (!SLA_RUNNING.includes(input.status)) return null;
  if (!input.decisionDueAt) return null;
  const band = slaBand(input.submittedAt, input.decisionDueAt, input.now, { paused, atRiskPct: input.atRiskPct });
  const left = new Date(input.decisionDueAt).getTime() - input.now.getTime();
  if (band === "paused") {
    const when = input.formatPausedAt && input.pausedAt ? input.formatPausedAt(input.pausedAt) : null;
    return { tone: "muted", label: when ? `Waiting on partner since ${when}` : "Waiting on partner", band };
  }
  if (band === "breached") return { tone: "danger", label: `Overdue by ${formatDuration(left)}`, band };
  if (band === "at_risk") return { tone: "attention", label: `Due in ${formatDuration(left)}`, band };
  if (band === "on_track") return { tone: "info", label: `Due in ${formatDuration(left)}`, band };
  return null;
}
