/**
 * Read model for the partner Requests list (brief §7.6): the organisation's requests
 * by chip, search and sort, paged in the database. RLS limits it to the caller's org.
 * "Needs my action" is counter-offers, payments due and requests still waiting for a
 * card hold, so the live rows are classified here before the page query runs.
 */
import "server-only";
import { toBookingRows, type BookingListRow } from "@/lib/admin/bookings";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import {
  BOOKING_GROUP_STATUSES,
  BOOKING_SORTS,
  PARTNER_GROUPS,
  type BookingSort,
  type PartnerGroup,
} from "@/lib/domain/list-display";
import { DEFAULT_PAGE_SIZE, clampPage, pageRange, toPage, type Page, type PageSize } from "@/lib/domain/list-params";
import { approvalPaymentGate, paymentModeFor, paymentStateFromStripe } from "@/lib/domain/payments";
import { QUEUE_STATUSES } from "@/lib/domain/requests";
import { withSearch } from "@/lib/requests/load";

export interface PartnerRequestsView extends Page<BookingListRow> {
  counts: Record<PartnerGroup, number>;
}

const LIVE: readonly BookingStatus[] = ["SUBMITTED", "UNDER_REVIEW", "COUNTER_OFFERED", "APPROVED", "AWAITING_PAYMENT"];

export async function loadPartnerRequests(opts: {
  orgId: string;
  group: PartnerGroup;
  q: string;
  sort: BookingSort;
  page: number;
  pageSize?: PageSize;
}): Promise<PartnerRequestsView> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const supabase = await createServerSupabase();

  // Classify the live requests (a handful) into "needs my action" and "in progress".
  const [{ data: org }, { data: live }] = await Promise.all([
    supabase.from("partner_orgs").select("payment_terms").eq("id", opts.orgId).maybeSingle(),
    withSearch(
      supabase
        .from("booking_requests")
        .select("id, status")
        .in("status", [...LIVE]),
      opts.q,
    ).limit(1000),
  ]);
  const mode = paymentModeFor(org?.payment_terms ?? null);
  const waiting = (live ?? []).filter((r) => QUEUE_STATUSES.includes(r.status)).map((r) => r.id);
  const held = new Set<string>();
  if (mode !== "invoice" && waiting.length) {
    const { data: pays } = await supabase
      .from("payments")
      .select("booking_id, status, failure_code, created_at")
      .in("booking_id", waiting)
      .order("created_at", { ascending: false });
    const seen = new Set<string>();
    for (const p of pays ?? []) {
      if (!p.booking_id || seen.has(p.booking_id)) continue;
      seen.add(p.booking_id);
      if (approvalPaymentGate(mode, paymentStateFromStripe(p.status, p.failure_code)).ok) held.add(p.booking_id);
    }
  }
  const needsAction = (r: { id: string; status: BookingStatus }) =>
    r.status === "COUNTER_OFFERED" ||
    r.status === "AWAITING_PAYMENT" ||
    (mode !== "invoice" && QUEUE_STATUSES.includes(r.status) && !held.has(r.id));
  const actionIds = (live ?? []).filter(needsAction).map((r) => r.id);
  const progressIds = (live ?? []).filter((r) => !needsAction(r)).map((r) => r.id);

  const base = (group: PartnerGroup, head: boolean) => {
    let q = supabase.from("booking_requests").select("*", { count: "exact", head }).neq("status", "DRAFT");
    if (group === "action") q = q.in("id", actionIds.length ? actionIds : ["00000000-0000-0000-0000-000000000000"]);
    if (group === "progress")
      q = q.in("id", progressIds.length ? progressIds : ["00000000-0000-0000-0000-000000000000"]);
    if (group === "confirmed" || group === "closed") q = q.in("status", [...BOOKING_GROUP_STATUSES[group]]);
    return withSearch(q, opts.q);
  };

  const countResults = await Promise.all(
    PARTNER_GROUPS.map((g) =>
      g === "action" ? { count: actionIds.length } : g === "progress" ? { count: progressIds.length } : base(g, true),
    ),
  );
  const counts = Object.fromEntries(PARTNER_GROUPS.map((g, i) => [g, countResults[i].count ?? 0])) as Record<
    PartnerGroup,
    number
  >;
  const total = counts[opts.group];
  const page = clampPage(opts.page, total, pageSize);
  const { from, to } = pageRange(page, pageSize);
  const { data, error } = await base(opts.group, false)
    .order(BOOKING_SORTS[opts.sort.key], { ascending: opts.sort.dir === "asc", nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`requests read failed: ${error.message}`);
  return { ...toPage(await toBookingRows(data ?? [], { partnerNames: true }), total, page, pageSize), counts };
}
