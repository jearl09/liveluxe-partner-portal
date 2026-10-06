/**
 * Partner dashboard view-model logic (spec §13.1 "/" and §13.5).
 * Pure: takes already-loaded rows and the current time, returns what the page renders.
 * Nothing here formats money (server-formatted strings travel through) or touches I/O.
 */
import type { BookingStatus } from "./booking-state-machine";

// ---------------------------------------------------------------------------
// Inputs — the minimal shape the loader hands over (one row per booking request).
// ---------------------------------------------------------------------------
export interface DashboardRequestRow {
  id: string;
  reference: string;
  status: BookingStatus;
  propertyName: string;
  suburb: string | null;
  checkIn: string; // YYYY-MM-DD, property-local
  checkOut: string;
  nights: number;
  guestName: string | null;
  claimRef: string | null;
  poNumber: string | null;
  totalFormatted: string | null; // "AUD $9,169.20", formatted server-side
  decisionDueAt: string | null; // ISO UTC
  holdExpiresAt: string | null;
  checkinReleasedAt: string | null;
  checkinReleasesAt: string | null; // check-in minus settings.checkin.release_offset_hours, ISO UTC
  unreadComments: number;
  paymentDue: boolean; // AWAITING_PAYMENT and the partner must act
}

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------
export function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** First name from the user record only (never from the email, §brief). Falls back to "there". */
export function firstName(fullName: string | null | undefined): string {
  const n = (fullName ?? "").trim().split(/\s+/)[0];
  return n || "there";
}

// ---------------------------------------------------------------------------
// Status pills — one mapping used everywhere in the app (§10 states)
// ---------------------------------------------------------------------------
export type PillTone = "navy-outline" | "gold" | "gold-filled" | "green" | "muted" | "red";

export const STATUS_LABELS: Record<BookingStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  COUNTER_OFFERED: "Counter-offered",
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

export function statusTone(status: BookingStatus): PillTone {
  switch (status) {
    case "DRAFT":
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "navy-outline";
    case "COUNTER_OFFERED":
      return "gold";
    case "AWAITING_PAYMENT":
      return "gold-filled";
    case "APPROVED":
    case "CONFIRMED":
    case "CHECKED_IN":
    case "COMPLETED":
      return "green";
    case "FAILED":
      return "red";
    default:
      return "muted";
  }
}

/** Statuses that still count as "in progress" for the dashboard table. */
export const IN_PROGRESS: readonly BookingStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "COUNTER_OFFERED",
  "APPROVED",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
];

export const PENDING_WITH_LIVLUXE: readonly BookingStatus[] = ["SUBMITTED", "UNDER_REVIEW"];

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------
/** "2 h 15 m", "1 h 40 m", "35 m", "3 d 4 h". Negative → "overdue by …". */
export function humanizeDuration(ms: number): string {
  const abs = Math.abs(ms);
  const m = Math.floor(abs / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  let s: string;
  if (d >= 1) s = `${d} d ${h % 24} h`;
  else if (h >= 1) s = `${h} h ${m % 60} m`;
  else s = `${Math.max(m, 1)} m`;
  return ms < 0 ? `overdue by ${s}` : s;
}

export function partnerActionRequired(r: DashboardRequestRow): boolean {
  return r.status === "COUNTER_OFFERED" || r.paymentDue || r.unreadComments > 0;
}

// ---------------------------------------------------------------------------
// "Needs your attention" strip — up to four single-action cards
// ---------------------------------------------------------------------------
export type AttentionKind = "counter_offer" | "payment_due" | "ops_reply" | "hold_expiring";

export interface AttentionItem {
  kind: AttentionKind;
  requestId: string;
  reference: string;
  title: string;
  context: string;
  cta: string;
  href: string;
  /** Lower sorts first. */
  urgencyMs: number;
}

export function deriveAttention(
  rows: readonly DashboardRequestRow[],
  now: Date,
  fmt: { timestamp: (iso: string) => string },
  limit = 4,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const r of rows) {
    const href = `/requests/${r.id}`;
    if (r.status === "COUNTER_OFFERED") {
      const due = r.holdExpiresAt ?? r.decisionDueAt;
      items.push({
        kind: "counter_offer",
        requestId: r.id,
        reference: r.reference,
        title: "Counter-offer to review",
        context: due
          ? `${r.reference} · reply before ${fmt.timestamp(due)}`
          : `${r.reference} · Live Luxe proposed an alternative`,
        cta: "Review",
        href,
        urgencyMs: due ? new Date(due).getTime() - now.getTime() : 0,
      });
    }
    if (r.paymentDue) {
      items.push({
        kind: "payment_due",
        requestId: r.id,
        reference: r.reference,
        title: r.totalFormatted ? `Payment due · ${r.totalFormatted}` : "Payment due",
        context: `${r.reference} · ${r.propertyName}`,
        cta: "Pay now",
        href: `${href}#pay`,
        urgencyMs: r.holdExpiresAt ? new Date(r.holdExpiresAt).getTime() - now.getTime() : 1,
      });
    }
    if (r.unreadComments > 0) {
      items.push({
        kind: "ops_reply",
        requestId: r.id,
        reference: r.reference,
        title: r.unreadComments === 1 ? "Ops replied" : `Ops replied · ${r.unreadComments} unread`,
        context: `${r.reference} · ${r.propertyName}`,
        cta: "Open thread",
        href: `${href}#comments`,
        urgencyMs: 6 * 3_600_000,
      });
    }
    if (r.holdExpiresAt && IN_PROGRESS.includes(r.status) && r.status !== "CONFIRMED" && r.status !== "CHECKED_IN") {
      const left = new Date(r.holdExpiresAt).getTime() - now.getTime();
      if (left > 0 && left <= 6 * 3_600_000 && r.status !== "COUNTER_OFFERED" && !r.paymentDue) {
        items.push({
          kind: "hold_expiring",
          requestId: r.id,
          reference: r.reference,
          title: `Hold expires in ${humanizeDuration(left)}`,
          context: `${r.reference} · ${r.propertyName}`,
          cta: "View",
          href,
          urgencyMs: left,
        });
      }
    }
  }
  return items.sort((a, b) => a.urgencyMs - b.urgencyMs).slice(0, limit);
}

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------
export interface Kpis {
  activePlacements: number;
  pendingWithLivluxe: number;
  checkInsNext7: number;
  checkOutsNext7: number;
  nextCheckInLabel: string | null; // "2 arriving Thursday"
  nextCheckOutLabel: string | null;
}

function dateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function todayLocal(now: Date, timeZone: string): string {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function withinNextDays(dateIso: string, today: string, days: number): boolean {
  const diff = (dateOnly(dateIso).getTime() - dateOnly(today).getTime()) / 86_400_000;
  return diff >= 0 && diff < days;
}

function weekdayLabel(dateIso: string, today: string): string {
  const diff = (dateOnly(dateIso).getTime() - dateOnly(today).getTime()) / 86_400_000;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "UTC" }).format(dateOnly(dateIso));
}

export function computeKpis(rows: readonly DashboardRequestRow[], now: Date, timeZone = "Australia/Melbourne"): Kpis {
  const today = todayLocal(now, timeZone);
  const live = rows.filter((r) => ["CONFIRMED", "CHECKED_IN"].includes(r.status));
  const activePlacements = live.filter((r) => r.checkIn <= today && r.checkOut > today).length;
  const pendingWithLivluxe = rows.filter((r) => PENDING_WITH_LIVLUXE.includes(r.status)).length;
  const ins = live
    .filter((r) => withinNextDays(r.checkIn, today, 7))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const outs = live
    .filter((r) => withinNextDays(r.checkOut, today, 7))
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut));
  const label = (list: DashboardRequestRow[], key: "checkIn" | "checkOut", verb: string) => {
    if (!list.length) return null;
    const first = list[0]![key];
    const count = list.filter((r) => r[key] === first).length;
    return `${count} ${verb} ${weekdayLabel(first, today)}`;
  };
  return {
    activePlacements,
    pendingWithLivluxe,
    checkInsNext7: ins.length,
    checkOutsNext7: outs.length,
    nextCheckInLabel: label(ins, "checkIn", "arriving"),
    nextCheckOutLabel: label(outs, "checkOut", "departing"),
  };
}

// ---------------------------------------------------------------------------
// Requests table
// ---------------------------------------------------------------------------
export interface RequestTableRow extends DashboardRequestRow {
  actionRequired: boolean;
  /** "Decision due in 2 h 15 m" / "Check-in pack releases 14 Oct, 2:00 pm AEST" / "Access details released". */
  dueLabel: string;
  dueTone: "navy" | "gold" | "muted" | "red";
}

export function buildRequestRows(
  rows: readonly DashboardRequestRow[],
  now: Date,
  fmt: { timestamp: (iso: string) => string },
  limit = 8,
): RequestTableRow[] {
  const out: RequestTableRow[] = rows
    .filter((r) => IN_PROGRESS.includes(r.status))
    .map((r) => {
      let dueLabel = "—";
      let dueTone: RequestTableRow["dueTone"] = "muted";
      let sortKey = Number.MAX_SAFE_INTEGER;
      if (r.status === "COUNTER_OFFERED") {
        dueLabel = "Your reply needed";
        dueTone = "gold";
        sortKey = 0;
      } else if (r.paymentDue) {
        dueLabel = r.holdExpiresAt
          ? `Pay within ${humanizeDuration(new Date(r.holdExpiresAt).getTime() - now.getTime())}`
          : "Payment needed";
        dueTone = "gold";
        sortKey = r.holdExpiresAt ? new Date(r.holdExpiresAt).getTime() : 1;
      } else if (PENDING_WITH_LIVLUXE.includes(r.status) && r.decisionDueAt) {
        const left = new Date(r.decisionDueAt).getTime() - now.getTime();
        dueLabel = left < 0 ? `Decision ${humanizeDuration(left)}` : `Decision due in ${humanizeDuration(left)}`;
        dueTone = left < 0 ? "red" : "navy";
        sortKey = new Date(r.decisionDueAt).getTime();
      } else if (["APPROVED", "CONFIRMED"].includes(r.status)) {
        if (r.checkinReleasedAt) {
          dueLabel = "Access details released";
          dueTone = "navy";
        } else if (r.checkinReleasesAt) {
          dueLabel = `Check-in pack releases ${fmt.timestamp(r.checkinReleasesAt)}`;
          dueTone = "navy";
        }
        sortKey = dateOnly(r.checkIn).getTime();
      } else if (r.status === "CHECKED_IN") {
        dueLabel = `Checks out ${fmtDate(r.checkOut)}`;
        dueTone = "muted";
        sortKey = dateOnly(r.checkOut).getTime();
      }
      return { ...r, actionRequired: partnerActionRequired(r), dueLabel, dueTone, sortKey };
    })
    .sort((a, b) => Number(b.actionRequired) - Number(a.actionRequired) || a.sortKey - b.sortKey)
    .slice(0, limit)
    .map((r) => {
      const { sortKey: _ignored, ...rest } = r;
      void _ignored;
      return rest;
    });
  return out;
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(dateOnly(iso));
}

// ---------------------------------------------------------------------------
// This week — 7-day agenda
// ---------------------------------------------------------------------------
export interface AgendaEntry {
  requestId: string;
  dateIso: string;
  dayLabel: string; // "Thu 9 Oct"
  direction: "in" | "out";
  guestSurname: string;
  propertyName: string;
  suburb: string | null;
  /** Check-ins only: "Access details released" | "Releases in 1 d 4 h" | null */
  accessNote: string | null;
}

export function buildAgenda(
  rows: readonly DashboardRequestRow[],
  now: Date,
  timeZone = "Australia/Melbourne",
  days = 7,
): AgendaEntry[] {
  const today = todayLocal(now, timeZone);
  const entries: AgendaEntry[] = [];
  const surname = (n: string | null) => (n ?? "").trim().split(/\s+/).pop() || "Guest";
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
      .format(dateOnly(iso))
      .replace(",", "");
  for (const r of rows) {
    if (!["CONFIRMED", "CHECKED_IN", "APPROVED"].includes(r.status)) continue;
    if (withinNextDays(r.checkIn, today, days)) {
      let accessNote: string | null = null;
      if (r.checkinReleasedAt) accessNote = "Access details released";
      else if (r.checkinReleasesAt) {
        const left = new Date(r.checkinReleasesAt).getTime() - now.getTime();
        accessNote = left <= 0 ? "Releasing shortly" : `Releases in ${humanizeDuration(left)}`;
      }
      entries.push({
        requestId: r.id,
        dateIso: r.checkIn,
        dayLabel: day(r.checkIn),
        direction: "in",
        guestSurname: surname(r.guestName),
        propertyName: r.propertyName,
        suburb: r.suburb,
        accessNote,
      });
    }
    if (withinNextDays(r.checkOut, today, days) && r.status !== "APPROVED") {
      entries.push({
        requestId: r.id,
        dateIso: r.checkOut,
        dayLabel: day(r.checkOut),
        direction: "out",
        guestSurname: surname(r.guestName),
        propertyName: r.propertyName,
        suburb: r.suburb,
        accessNote: null,
      });
    }
  }
  return entries.sort((a, b) => a.dateIso.localeCompare(b.dateIso) || (a.direction === "out" ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Data freshness pill
// ---------------------------------------------------------------------------
export interface Freshness {
  state: "fresh" | "stale" | "unknown";
  label: string;
}

export function evaluateFreshness(lastSyncIso: string | null, now: Date, staleAfterMinutes: number): Freshness {
  if (!lastSyncIso) return { state: "unknown", label: "Availability not yet synced" };
  const age = now.getTime() - new Date(lastSyncIso).getTime();
  if (age > staleAfterMinutes * 60_000) return { state: "stale", label: "Sync delayed — availability may be stale" };
  const m = Math.floor(age / 60_000);
  return { state: "fresh", label: m < 1 ? "Availability synced just now" : `Availability synced ${m} min ago` };
}
