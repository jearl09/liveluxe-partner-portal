/**
 * Partner dashboard loader (spec §13.1 "/"). Runs in a Server Component on the RLS client,
 * so every query is already scoped to the caller's organisation; nothing here filters by org_id
 * because the database does, and the page must never assume otherwise.
 *
 * Phase 3 wires the real request lifecycle. Until then the queries return empty sets on a fresh
 * org, and `?demo=1` (non-production only) renders the sample data in lib/dashboard/demo.ts so
 * the design can be reviewed.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { SessionClaims } from "@/lib/domain/permissions";
import { can } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { formatTimestamp } from "@/lib/utils";
import {
  buildAgenda,
  buildRequestRows,
  computeKpis,
  deriveAttention,
  evaluateFreshness,
  firstName,
  greetingForHour,
  type DashboardRequestRow,
} from "@/lib/domain/dashboard";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import { log } from "@/lib/observability/logger";
import type { ActivityEvent, DashboardData, Section } from "./types";
import { demoRequests, demoActivity } from "./demo";

const TZ = "Australia/Melbourne";
const RELEASE_OFFSET_HOURS = 48; // TODO(phase-5): read settings.checkin.release_offset_hours via a partner-safe function

function hourIn(tz: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hour12: false, timeZone: tz }).format(now));
}

/** Support reference for a failed section: short, loggable, never a stack trace. */
function failRef(section: string, e: unknown): Section<never> {
  const ref = `LLX-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
  log.error("dashboard.section_failed", { section, ref, error: e instanceof Error ? e.message : String(e) });
  return { ok: false, ref };
}

async function section<T>(name: string, fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return failRef(name, e);
  }
}

const fmt = { timestamp: (iso: string) => formatTimestamp(iso, TZ) };

export async function loadDashboard(claims: SessionClaims, opts: { demo?: boolean } = {}): Promise<DashboardData> {
  const now = new Date();
  const supabase = await createServerSupabase();
  const demo = opts.demo === true && process.env.VERCEL_ENV !== "production";

  const [{ data: user }, { data: org }, freshnessRes] = await Promise.all([
    supabase.from("partner_users").select("full_name").eq("auth_user_id", claims.sub).maybeSingle(),
    supabase.from("partner_orgs").select("name, logo_url").eq("id", claims.org_id).maybeSingle(),
    supabase.rpc("availability_freshness"),
  ]);

  const fresh = freshnessRes.data?.[0];
  const freshness = demo
    ? evaluateFreshness(new Date(now.getTime() - 3 * 60_000).toISOString(), now, 30)
    : evaluateFreshness(fresh?.last_synced_at ?? null, now, fresh?.stale_after_minutes ?? 30);

  const rowsSection = await section("requests", async (): Promise<DashboardRequestRow[]> => {
    if (demo) return demoRequests(now);
    const { data, error } = await supabase
      .from("booking_requests")
      .select(
        "id, reference, status, listing_id, check_in, check_out, nights, guest_name, claim_ref, po_number, total_cents, currency, hold_expires_at, decision_due_at, checkin_released_at, updated_at",
      )
      .neq("status", "DRAFT")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const listingIds = [...new Set((data ?? []).map((r) => r.listing_id))];
    const { data: listings } = listingIds.length
      ? await supabase.from("listings").select("id, public_name, suburb").in("id", listingIds)
      : { data: [] as { id: string; public_name: string; suburb: string | null }[] };
    const byId = new Map((listings ?? []).map((l) => [l.id, l]));
    return (data ?? []).map((r) => {
      const l = byId.get(r.listing_id);
      const releasesAt = new Date(`${r.check_in}T14:00:00+11:00`); // TODO(phase-5): property-local check-in time
      releasesAt.setHours(releasesAt.getHours() - RELEASE_OFFSET_HOURS);
      return {
        id: r.id,
        reference: r.reference,
        status: r.status as BookingStatus,
        propertyName: l?.public_name ?? "Property",
        suburb: l?.suburb ?? null,
        checkIn: r.check_in,
        checkOut: r.check_out,
        nights: r.nights,
        guestName: r.guest_name,
        claimRef: r.claim_ref,
        poNumber: r.po_number,
        totalFormatted: r.total_cents == null ? null : formatMoney(r.total_cents, r.currency),
        decisionDueAt: r.decision_due_at,
        holdExpiresAt: r.hold_expires_at,
        checkinReleasedAt: r.checkin_released_at,
        checkinReleasesAt: ["APPROVED", "CONFIRMED"].includes(r.status) ? releasesAt.toISOString() : null,
        unreadComments: 0, // TODO(phase-3): booking_comments unread count per request
        paymentDue: r.status === "AWAITING_PAYMENT",
      };
    });
  });

  const rows = rowsSection.ok ? rowsSection.data : [];
  const kpis = rowsSection.ok ? computeKpis(rows, now, TZ) : null;

  const activity = await section("activity", async (): Promise<ActivityEvent[]> => {
    if (demo) return demoActivity(now, fmt.timestamp);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(6);
    if (error) throw new Error(error.message);
    return (data ?? []).map((n) => {
      const p = (n.payload ?? {}) as Record<string, unknown>;
      return {
        id: n.id,
        requestId: typeof p.requestId === "string" ? p.requestId : null,
        reference: typeof p.reference === "string" ? p.reference : null,
        verb: VERBS[n.type] ?? n.type.replace(/_/g, " "),
        actor: typeof p.actor === "string" ? p.actor : null,
        atIso: n.created_at,
        atLabel: fmt.timestamp(n.created_at),
        atUtc: new Date(n.created_at).toISOString(),
      };
    });
  });

  return {
    greeting: greetingForHour(hourIn(TZ, now)),
    firstName: firstName(demo ? "Claudia" : user?.full_name),
    orgName: demo ? "Acme Insurance" : (org?.name ?? "Your organisation"),
    orgLogoUrl: org?.logo_url ?? null,
    canBook: can(claims.role, "requests.submit"),
    lastSuburb: null, // TODO(phase-2): saved_searches.last_used
    freshness,
    summary: { activePlacements: kpis?.activePlacements ?? 0, pendingRequests: kpis?.pendingWithLivluxe ?? 0 },
    attention: rowsSection.ok ? { ok: true, data: deriveAttention(rows, now, fmt) } : rowsSection,
    kpis: rowsSection.ok && kpis ? { ok: true, data: kpis } : (rowsSection as Section<never>),
    requests: rowsSection.ok ? { ok: true, data: buildRequestRows(rows, now, fmt) } : rowsSection,
    agenda: rowsSection.ok ? { ok: true, data: buildAgenda(rows, now, TZ) } : rowsSection,
    activity,
    firstTime: rowsSection.ok && rows.length === 0,
    demo,
  };
}

const VERBS: Record<string, string> = {
  request_received: "Submitted",
  request_approved: "Approved",
  request_declined: "Declined",
  counter_offer: "Counter-offer made",
  comment_added: "Comment added",
  invoice_issued: "Invoice issued",
  payment_failed: "Payment failed",
  checkin_details: "Check-in details released",
  hold_expiring: "Hold expiring",
};
