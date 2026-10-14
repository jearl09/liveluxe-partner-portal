/**
 * The ops request queue (brief §6.3): the four summary cards, what each one filters,
 * and the live subtitle. Pure.
 */
import type { SlaBand } from "./requests";

export const QUEUE_VIEWS = ["breached", "soon", "waiting", "partner"] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

export const QUEUE_VIEW_LABELS: Record<QueueView, string> = {
  breached: "Breached",
  soon: "Due within 2 h",
  waiting: "Waiting on Live Luxe",
  partner: "Awaiting partner",
};

export const SOON_MS = 2 * 60 * 60 * 1000;

export interface QueueRowFacts {
  band: SlaBand;
  decisionDueAt: string | null;
  /** Card-paying partner with no card hold yet: ops cannot approve, the partner must act. */
  cardNeeded: boolean;
}

/** Waiting on the partner rather than on Live Luxe: the clock is paused or no card is held. */
export function awaitingPartner(r: QueueRowFacts): boolean {
  return r.band === "paused" || r.cardNeeded;
}

export function inView(r: QueueRowFacts, view: QueueView, now: Date): boolean {
  const partner = awaitingPartner(r);
  switch (view) {
    case "partner":
      return partner;
    case "waiting":
      return !partner;
    case "breached":
      return !partner && r.band === "breached";
    case "soon": {
      if (partner || r.band === "breached" || !r.decisionDueAt) return false;
      return new Date(r.decisionDueAt).getTime() - now.getTime() <= SOON_MS;
    }
  }
}

export interface QueueCounts extends Record<QueueView, number> {
  atRisk: number;
  /** Earliest deadline still in the future among rows waiting on Live Luxe. */
  nextDueAt: string | null;
}

export function queueCounts(rows: QueueRowFacts[], now: Date): QueueCounts {
  const c: QueueCounts = { breached: 0, soon: 0, waiting: 0, partner: 0, atRisk: 0, nextDueAt: null };
  for (const r of rows) {
    for (const v of QUEUE_VIEWS) if (inView(r, v, now)) c[v] += 1;
    if (!awaitingPartner(r) && r.band === "at_risk") c.atRisk += 1;
    if (!awaitingPartner(r) && r.decisionDueAt && new Date(r.decisionDueAt).getTime() > now.getTime())
      if (!c.nextDueAt || r.decisionDueAt < c.nextDueAt) c.nextDueAt = r.decisionDueAt;
  }
  return c;
}

/** "4 waiting · 1 at risk · 0 breached · next due in 38 min", or "Nothing waiting on Live Luxe". */
export function queueSubtitle(c: QueueCounts, now: Date, duration: (ms: number) => string): string {
  if (c.waiting === 0)
    return c.partner > 0
      ? `Nothing waiting on Live Luxe · ${c.partner} with the partner`
      : "Nothing waiting on Live Luxe";
  const parts = [`${c.waiting} waiting`, `${c.atRisk} at risk`, `${c.breached} breached`];
  if (c.nextDueAt) parts.push(`next due in ${duration(new Date(c.nextDueAt).getTime() - now.getTime())}`);
  return parts.join(" · ");
}

export function parseQueueView(v: string | string[] | undefined): QueueView | null {
  const s = Array.isArray(v) ? v[0] : v;
  return (QUEUE_VIEWS as readonly string[]).includes(s ?? "") ? (s as QueueView) : null;
}
