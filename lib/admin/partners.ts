/**
 * Read model for the ops Partners list (brief §6.5): who are our partners and is
 * anything wrong with any of them. One row per organisation with its terms, the rate
 * card in force, people, open requests, money outstanding and last activity.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import { invoiceStatus, balanceOf } from "@/lib/domain/invoices";
import { listOrgs, type PartnerOrgRow } from "@/lib/partners/load";
import { currentRateCardsByOrg, type RateCardVersion } from "@/lib/rate-cards/load";

export interface PartnerListRow {
  org: PartnerOrgRow;
  users: number;
  openInvitations: number;
  rateCard: RateCardVersion | null;
  openRequests: number;
  outstandingCents: number;
  overdue: boolean;
  lastActivityAt: string | null;
}

const OPEN = ["SUBMITTED", "UNDER_REVIEW", "COUNTER_OFFERED", "APPROVED", "AWAITING_PAYMENT"] as const;

export async function loadPartners(today: string): Promise<PartnerListRow[]> {
  const supabase = await createServerSupabase();
  const now = new Date();
  const [orgs, cards, { data: reqs }, { data: invoices }] = await Promise.all([
    listOrgs(),
    currentRateCardsByOrg(today),
    supabase.from("booking_requests").select("org_id, status, updated_at").neq("status", "DRAFT").limit(20000),
    supabase
      .from("invoices")
      .select("org_id, status, amount_due_cents, amount_paid_cents, due_at, paid_at")
      .in("status", ["open", "uncollectible"]),
  ]);
  const open = new Map<string, number>();
  const last = new Map<string, string>();
  for (const r of reqs ?? []) {
    if ((OPEN as readonly string[]).includes(r.status)) open.set(r.org_id, (open.get(r.org_id) ?? 0) + 1);
    if (!last.has(r.org_id) || r.updated_at > last.get(r.org_id)!) last.set(r.org_id, r.updated_at);
  }
  const owed = new Map<string, { cents: number; overdue: boolean }>();
  for (const i of invoices ?? []) {
    const o = owed.get(i.org_id) ?? { cents: 0, overdue: false };
    o.cents += balanceOf(i);
    if (invoiceStatus(i, now) === "overdue") o.overdue = true;
    owed.set(i.org_id, o);
  }
  return orgs.map(({ org, users, openInvitations }) => ({
    org,
    users,
    openInvitations,
    rateCard: cards.get(org.id) ?? null,
    openRequests: open.get(org.id) ?? 0,
    outstandingCents: owed.get(org.id)?.cents ?? 0,
    overdue: owed.get(org.id)?.overdue ?? false,
    lastActivityAt: last.get(org.id) ?? null,
  }));
}
