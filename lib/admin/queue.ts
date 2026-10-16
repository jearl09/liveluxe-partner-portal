/**
 * Read model for the ops request queue (brief §6.3). Everything waiting on a
 * decision, most urgent first, with what the row needs to be decided from the list:
 * who asked, whether the card is held, the quote lines and how this partner's past
 * requests went. RLS: Live Luxe staff read every row.
 */
import "server-only";
import { staffPropertyName } from "@/lib/domain/property-name";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingRequestRow } from "@/lib/db/types";
import { approvalPaymentGate, paymentModeFor, paymentStateFromStripe, type PaymentMode } from "@/lib/domain/payments";
import type { QuoteLine } from "@/lib/domain/quote-engine";
import { QUEUE_STATUSES, slaBand, type SlaBand } from "@/lib/domain/requests";
import { withSearch } from "@/lib/requests/load";

export interface QueueRow {
  r: BookingRequestRow;
  orgName: string | null;
  requesterName: string | null;
  propertyName: string;
  suburb: string | null;
  band: SlaBand;
  decisionDueAt: string | null;
  mode: PaymentMode;
  gate: { ok: boolean; reason?: string };
  cardNeeded: boolean;
  quote: { lines: QuoteLine[]; totalCents: number; depositCents: number } | null;
  /** This partner's requests so far (not counting drafts). */
  history: { total: number; confirmed: number; declined: number; cancelled: number };
}

export interface QueueData {
  rows: QueueRow[];
  /** When Live Luxe last approved, countered or declined anything, for the empty state. */
  lastDecisionAt: string | null;
}

const CONFIRMED_LIKE = new Set(["APPROVED", "AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN", "COMPLETED"]);

export async function loadQueue(opts: { orgId?: string | null; q?: string } = {}): Promise<QueueData> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from("booking_requests")
    .select("*")
    .in("status", [...QUEUE_STATUSES])
    .order("decision_due_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(500);
  if (opts.orgId) q = q.eq("org_id", opts.orgId);
  q = withSearch(q, opts.q ?? "");
  const [{ data, error }, last] = await Promise.all([
    q,
    supabase
      .from("booking_status_history")
      .select("occurred_at")
      .in("to_status", ["APPROVED", "DECLINED", "COUNTER_OFFERED"])
      .eq("actor_type", "livluxe")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) throw new Error(`queue read failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return { rows: [], lastDecisionAt: last.data?.occurred_at ?? null };

  const ids = rows.map((r) => r.id);
  const orgIds = [...new Set(rows.map((r) => r.org_id))];
  const listingIds = [...new Set(rows.map((r) => r.listing_id))];
  const userIds = [...new Set(rows.map((r) => r.created_by))];
  const quoteIds = rows.map((r) => r.quote_id).filter((x): x is string => !!x);

  const [orgs, listings, users, payments, quotes, past] = await Promise.all([
    supabase.from("partner_orgs").select("id, name, payment_terms").in("id", orgIds),
    supabase.from("listings").select("id, public_name, internal_name, suburb").in("id", listingIds),
    supabase.from("partner_users").select("id, full_name").in("id", userIds),
    supabase
      .from("payments")
      .select("booking_id, status, failure_code, created_at")
      .in("booking_id", ids)
      .order("created_at", { ascending: false }),
    quoteIds.length
      ? supabase.from("quotes").select("id, line_items, total_cents, deposit_cents").in("id", quoteIds)
      : Promise.resolve({
          data: [] as { id: string; line_items: unknown; total_cents: number; deposit_cents: number }[],
        }),
    supabase.from("booking_requests").select("org_id, status").in("org_id", orgIds).neq("status", "DRAFT").limit(5000),
  ]);

  const orgBy = new Map((orgs.data ?? []).map((o) => [o.id, o]));
  const listingBy = new Map((listings.data ?? []).map((l) => [l.id, l]));
  const userBy = new Map((users.data ?? []).map((u) => [u.id, u.full_name]));
  const quoteBy = new Map((quotes.data ?? []).map((x) => [x.id, x]));
  const payBy = new Map<string, { status: string; failure_code: string | null }>();
  for (const p of payments.data ?? []) if (p.booking_id && !payBy.has(p.booking_id)) payBy.set(p.booking_id, p);
  const histBy = new Map<string, QueueRow["history"]>();
  for (const p of past.data ?? []) {
    const h = histBy.get(p.org_id) ?? { total: 0, confirmed: 0, declined: 0, cancelled: 0 };
    h.total += 1;
    if (CONFIRMED_LIKE.has(p.status)) h.confirmed += 1;
    if (p.status === "DECLINED") h.declined += 1;
    if (p.status === "CANCELLED") h.cancelled += 1;
    histBy.set(p.org_id, h);
  }

  const now = new Date();
  return {
    lastDecisionAt: last.data?.occurred_at ?? null,
    rows: rows.map((r) => {
      const org = orgBy.get(r.org_id);
      const mode = paymentModeFor(org?.payment_terms ?? null);
      const pay = payBy.get(r.id);
      const gate = approvalPaymentGate(mode, pay ? paymentStateFromStripe(pay.status, pay.failure_code) : null);
      const qt = r.quote_id ? quoteBy.get(r.quote_id) : undefined;
      const listing = listingBy.get(r.listing_id);
      return {
        r,
        orgName: org?.name ?? null,
        requesterName: userBy.get(r.created_by) ?? null,
        propertyName: staffPropertyName(listing?.public_name, listing?.internal_name),
        suburb: listing?.suburb ?? null,
        band: slaBand(r.submitted_at, r.decision_due_at, now, { paused: r.sla_paused_at !== null }),
        decisionDueAt: r.decision_due_at,
        mode,
        gate,
        cardNeeded: mode !== "invoice" && !gate.ok,
        quote: qt
          ? {
              lines: (qt.line_items as unknown as QuoteLine[] | null) ?? [],
              totalCents: qt.total_cents,
              depositCents: qt.deposit_cents,
            }
          : null,
        history: histBy.get(r.org_id) ?? { total: 0, confirmed: 0, declined: 0, cancelled: 0 },
      };
    }),
  };
}
