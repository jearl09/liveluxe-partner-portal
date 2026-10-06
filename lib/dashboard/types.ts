/** Data contract between the dashboard loader and its components. Everything is already formatted for display. */
import type { AgendaEntry, AttentionItem, Freshness, Kpis, RequestTableRow } from "@/lib/domain/dashboard";

export interface ActivityEvent {
  id: string;
  requestId: string | null;
  reference: string | null;
  /** "Approved", "Declined", "Comment added", "Invoice issued" */
  verb: string;
  actor: string | null;
  atIso: string;
  atLabel: string; // "14 Sep 2026, 4:12 pm AEST"
  atUtc: string; // "2026-09-14T06:12:00Z" (shown on hover)
}

/** Each section loads independently so one failure never blanks the page (§13.5 error handling). */
export type Section<T> = { ok: true; data: T } | { ok: false; ref: string };

export interface DashboardData {
  greeting: string; // "Good morning"
  firstName: string;
  orgName: string;
  orgLogoUrl: string | null;
  canBook: boolean;
  lastSuburb: string | null;
  freshness: Freshness;
  summary: { activePlacements: number; pendingRequests: number };
  attention: Section<AttentionItem[]>;
  kpis: Section<Kpis>;
  requests: Section<RequestTableRow[]>;
  agenda: Section<AgendaEntry[]>;
  activity: Section<ActivityEvent[]>;
  /** True when the org has never submitted anything: shows the first-time empty state. */
  firstTime: boolean;
  demo: boolean;
}
