/**
 * Read model for the ops Bookings list (brief §6.4): every request across every
 * partner, by status group, partner and search, sorted and paged in the database,
 * with the counts behind the group chips and what the "Next step" cell needs.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import {
  BOOKING_GROUPS,
  BOOKING_GROUP_STATUSES,
  BOOKING_SORTS,
  type BookingGroup,
  type BookingSort,
} from "@/lib/domain/list-display";
import { DEFAULT_PAGE_SIZE, clampPage, pageRange, toPage, type Page, type PageSize } from "@/lib/domain/list-params";
import { approvalPaymentGate, paymentModeFor, paymentStateFromStripe } from "@/lib/domain/payments";
import { QUEUE_STATUSES } from "@/lib/domain/requests";
import { withSearch } from "@/lib/requests/load";

export interface BookingListRow {
  id: string;
  reference: string;
  status: BookingStatus;
  claimRef: string | null;
  poNumber: string | null;
  orgName: string | null;
  /** Placed by Live Luxe staff on the partner's behalf. */
  viaLiveLuxe: boolean;
  propertyName: string;
  suburb: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string | null;
  totalCents: number | null;
  currency: string;
  submittedAt: string | null;
  decisionDueAt: string | null;
  slaPausedAt: string | null;
  holdExpiresAt: string | null;
  checkinReleasedAt: string | null;
  /** Card-paying partner with no card hold on a request waiting for a decision. */
  cardNeeded: boolean;
  updatedAt: string;
}

export interface BookingsView extends Page<BookingListRow> {
  counts: Record<BookingGroup, number>;
}

export async function loadBookings(opts: {
  group: BookingGroup;
  orgId: string | null;
  q: string;
  sort: BookingSort;
  page: number;
  pageSize?: PageSize;
}): Promise<BookingsView> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const supabase = await createServerSupabase();
  const base = (group: BookingGroup, head: boolean) => {
    let q = supabase.from("booking_requests").select("*", { count: "exact", head }).neq("status", "DRAFT");
    if (group !== "all") q = q.in("status", [...BOOKING_GROUP_STATUSES[group]]);
    if (opts.orgId) q = q.eq("org_id", opts.orgId);
    return withSearch(q, opts.q);
  };

  // One count per chip, each under the same partner and search filters.
  const countResults = await Promise.all(BOOKING_GROUPS.map((g) => base(g, true)));
  const counts = Object.fromEntries(BOOKING_GROUPS.map((g, i) => [g, countResults[i].count ?? 0])) as Record<
    BookingGroup,
    number
  >;
  const total = counts[opts.group];
  const page = clampPage(opts.page, total, pageSize);
  const { from, to } = pageRange(page, pageSize);
  const col = BOOKING_SORTS[opts.sort.key];
  const { data, error } = await base(opts.group, false)
    .order(col, { ascending: opts.sort.dir === "asc", nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`bookings read failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return { ...toPage([], total, page, pageSize), counts };

  const listingIds = [...new Set(rows.map((r) => r.listing_id))];
  const orgIds = [...new Set(rows.map((r) => r.org_id))];
  const userIds = [...new Set(rows.map((r) => r.created_by))];
  const waiting = rows.filter((r) => QUEUE_STATUSES.includes(r.status)).map((r) => r.id);
  const [listings, orgs, users, payments] = await Promise.all([
    supabase.from("listings").select("id, public_name, suburb").in("id", listingIds),
    supabase.from("partner_orgs").select("id, name, payment_terms").in("id", orgIds),
    supabase.from("partner_users").select("id, role").in("id", userIds),
    waiting.length
      ? supabase
          .from("payments")
          .select("booking_id, status, failure_code, created_at")
          .in("booking_id", waiting)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { booking_id: string | null; status: string; failure_code: string | null }[] }),
  ]);
  const listingBy = new Map((listings.data ?? []).map((l) => [l.id, l]));
  const orgBy = new Map((orgs.data ?? []).map((o) => [o.id, o]));
  const roleBy = new Map((users.data ?? []).map((u) => [u.id, u.role]));
  const payBy = new Map<string, { status: string; failure_code: string | null }>();
  for (const p of payments.data ?? []) if (p.booking_id && !payBy.has(p.booking_id)) payBy.set(p.booking_id, p);

  const out: BookingListRow[] = rows.map((r) => {
    const org = orgBy.get(r.org_id);
    const listing = listingBy.get(r.listing_id);
    const mode = paymentModeFor(org?.payment_terms ?? null);
    const pay = payBy.get(r.id);
    const cardNeeded =
      QUEUE_STATUSES.includes(r.status) &&
      mode !== "invoice" &&
      !approvalPaymentGate(mode, pay ? paymentStateFromStripe(pay.status, pay.failure_code) : null).ok;
    return {
      id: r.id,
      reference: r.reference,
      status: r.status,
      claimRef: r.claim_ref,
      poNumber: r.po_number,
      orgName: org?.name ?? null,
      viaLiveLuxe: (roleBy.get(r.created_by) ?? "").startsWith("livluxe_"),
      propertyName: listing?.public_name ?? "Property",
      suburb: listing?.suburb ?? null,
      checkIn: r.check_in,
      checkOut: r.check_out,
      nights: r.nights,
      guestName: r.guest_name,
      totalCents: r.total_cents,
      currency: r.currency,
      submittedAt: r.submitted_at,
      decisionDueAt: r.decision_due_at,
      slaPausedAt: r.sla_paused_at,
      holdExpiresAt: r.hold_expires_at,
      checkinReleasedAt: r.checkin_released_at,
      cardNeeded,
      updatedAt: r.updated_at,
    };
  });
  return { ...toPage(out, total, page, pageSize), counts };
}
