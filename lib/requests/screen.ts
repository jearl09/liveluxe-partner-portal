/**
 * Everything the request detail screen needs (brief §8), loaded once for both sides.
 * The partner page and the ops page differ only in `audience` and permissions; the
 * data, and therefore the facts each side sees, are the same.
 */
import "server-only";
import { headers } from "next/headers";
import type { BookingModificationRow, BookingStatusDb } from "@/lib/db/types";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import { todayIn } from "@/lib/domain/dates";
import { partnerPropertyName, staffPropertyName } from "@/lib/domain/property-name";
import { approvalPaymentGate, paymentModeFor, type PaymentMode } from "@/lib/domain/payments";
import { can, type SessionClaims } from "@/lib/domain/permissions";
import { orgPaymentTerms, paymentViewForBooking } from "@/lib/payments/load";
import { cancellationView, type CancellationView } from "./cancel";
import { checkinAccessLog, checkinView, recordCheckinAccess, type CheckinView } from "./checkin";
import { loadLongStayFromNights } from "./decide";
import { getRequest, type RequestDetail } from "./load";
import { modificationsForBooking } from "./modifications";

export interface RequestScreen {
  audience: "partner" | "ops";
  d: RequestDetail;
  mode: PaymentMode;
  terms: string | null;
  pay: Awaited<ReturnType<typeof paymentViewForBooking>>;
  cancel: CancellationView;
  modifications: BookingModificationRow[];
  checkin: CheckinView;
  accessLog: Awaited<ReturnType<typeof checkinAccessLog>>;
  gate: { ok: boolean; reason?: string };
  /** For ended requests: the furthest live status reached before it ended (step tracker). */
  reachedBeforeEnd: BookingStatus | null;
  counter: {
    message: string | null;
    previousCheckIn: string | null;
    previousCheckOut: string | null;
    newTotalCents: number | null;
    previousTotalCents: number | null;
  } | null;
  can: { submit: boolean; cancel: boolean; approve: boolean; release: boolean; overrideRefund: boolean };
  today: string;
  /** settings `stay.long_stay_terms_from_nights`: from this many nights the quote must carry terms. */
  longStayFromNights: number;
}

const ENDED: readonly BookingStatusDb[] = ["DECLINED", "EXPIRED", "CANCELLED", "FAILED"];
const ORDER: BookingStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "COUNTER_OFFERED",
  "APPROVED",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
];

export async function loadRequestScreen(
  id: string,
  claims: SessionClaims,
  audience: "partner" | "ops",
): Promise<RequestScreen | null> {
  const d = await getRequest(id);
  if (!d) return null;
  const r = d.request;
  const [terms, pay, cancel, modifications, checkin, accessLog, longStayFromNights] = await Promise.all([
    orgPaymentTerms(r.org_id),
    paymentViewForBooking(id),
    cancellationView(d),
    modificationsForBooking(id),
    checkinView(r),
    audience === "ops" && r.checkin_released_at ? checkinAccessLog(id) : Promise.resolve([]),
    loadLongStayFromNights(),
  ]);

  // §8.4: every partner view of a released pack is logged with user, time and IP.
  if (audience === "partner" && checkin.tier === "full") {
    const h = await headers();
    await recordCheckinAccess({
      bookingId: r.id,
      claims,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    });
  }

  // Partners see the street-style name; ops see the internal street name with the unit they work from.
  if (audience === "ops") d.listing.name = staffPropertyName(d.listing.name, d.listing.internalName);
  if (audience === "partner") {
    d.listing.name = partnerPropertyName(d.listing.name, d.listing.internalName);
    // The internal name carries owner and channel codes; it never reaches a partner's page.
    d.listing.internalName = null;
  }
  const mode = paymentModeFor(terms);
  let reachedBeforeEnd: BookingStatus | null = null;
  if (ENDED.includes(r.status)) {
    for (const h of d.history) {
      if (ORDER.includes(h.to) && (!reachedBeforeEnd || ORDER.indexOf(h.to) > ORDER.indexOf(reachedBeforeEnd)))
        reachedBeforeEnd = h.to;
    }
  }
  const counterEntry =
    r.status === "COUNTER_OFFERED" ? d.history.filter((h) => h.to === "COUNTER_OFFERED").at(-1) : null;
  const m = counterEntry?.metadata ?? null;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);

  return {
    audience,
    d,
    mode,
    terms: terms ?? null,
    longStayFromNights,
    pay,
    cancel,
    modifications,
    checkin,
    accessLog,
    gate: approvalPaymentGate(mode, pay.state),
    reachedBeforeEnd,
    counter: counterEntry
      ? {
          message: str(m?.message),
          previousCheckIn: str(m?.previousCheckIn),
          previousCheckOut: str(m?.previousCheckOut),
          newTotalCents: num(m?.newTotalCents),
          previousTotalCents: num(m?.previousTotalCents),
        }
      : null,
    can: {
      submit: can(claims.role, "requests.submit"),
      cancel: can(claims.role, "requests.cancel"),
      approve: can(claims.role, "requests.approve"),
      release: can(claims.role, "checkin.release"),
      overrideRefund: can(claims.role, "refunds.issue"),
    },
    today: todayIn("Australia/Melbourne"),
  };
}
