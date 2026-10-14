/**
 * reconcile-hostaway — the write-back half of spec §6.7 / §17.3 (Phase 5).
 *
 * For every platform booking that should be in Hostaway (CONFIRMED / CHECKED_IN
 * with a reservation id, plus APPROVED bookings whose write may have landed) list
 * the reservations on its listing around its arrival date and check:
 *   • duplicates   two live reservations for one booking reference → CRITICAL with
 *                  both ids; the duplicate is surfaced for guided cancellation
 *   • cancelled    our reservation is cancelled in Hostaway → booking marked
 *                  cancelled-upstream, partner + ops told (CRITICAL), refund
 *                  workflow raised for finance as a reconciliation exception
 *   • missing      our reservation id is not in Hostaway → CRITICAL
 *   • clock skew   a Hostaway timestamp in the future is clamped and logged
 *
 * The Phase 1 catalogue/calendar drift comparison is out of scope here and noted
 * in the handoff; this job is scoped to the money-bearing bookings.
 */
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow } from "@/lib/db/types";
import {
  inspectWriteBack,
  normaliseUpstreamTimestamp,
  type ReservationLike,
} from "@/lib/domain/hostaway-reconciliation";
import type { ReconException } from "@/lib/domain/reconciliation";
import { hostaway } from "@/lib/hostaway/api";
import { toReservationLike, writeBackConfig } from "@/lib/hostaway/reservations";
import { alertCritical, slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { sendBookingCancelled } from "@/lib/payments/notify";
import { alertStaleExceptions, persistExceptions } from "./reconcile-stripe";
import type { JobFn } from "./registry";

export interface HostawayReconResult {
  examined: number;
  duplicates: number;
  cancelledUpstream: number;
  missing: number;
  skewed: number;
  apiCalls: number;
  exceptions: ReconException[];
}

export async function runHostawayReconciliation(requestId: string, now = new Date()): Promise<HostawayReconResult> {
  const db = adminDb();
  const today = now.toISOString().slice(0, 10);
  const { data: bookings, error } = await db
    .from("booking_requests")
    .select("*")
    .in("status", ["CONFIRMED", "CHECKED_IN", "APPROVED", "AWAITING_PAYMENT"])
    .gte("check_out", today)
    .limit(1000);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);
  const live = (bookings ?? []).filter((b) => b.hostaway_reservation_id || b.hostaway_write_attempted_at);
  const cfg = await writeBackConfig();

  const listingIds = [...new Set(live.map((b) => b.listing_id))];
  const { data: listings } = listingIds.length
    ? await db.from("listings").select("id, public_name, hostaway_listing_id").in("id", listingIds)
    : { data: [] as { id: string; public_name: string; hostaway_listing_id: number }[] };
  const listingOf = new Map((listings ?? []).map((l) => [l.id, l]));

  const result: HostawayReconResult = {
    examined: live.length,
    duplicates: 0,
    cancelledUpstream: 0,
    missing: 0,
    skewed: 0,
    apiCalls: 0,
    exceptions: [],
  };

  // One listing call per listing covers every booking on it.
  const byListing = new Map<string, BookingRequestRow[]>();
  for (const b of live) byListing.set(b.listing_id, [...(byListing.get(b.listing_id) ?? []), b]);

  for (const [listingId, group] of byListing) {
    const l = listingOf.get(listingId);
    if (!l) continue;
    const arrivals = group.map((b) => b.check_in).sort();
    const res = await hostaway.listReservations({
      listingId: l.hostaway_listing_id,
      arrivalStartDate: arrivals[0],
      arrivalEndDate: arrivals[arrivals.length - 1],
      limit: 200,
    });
    result.apiCalls++;
    if (!res.ok) {
      log.warn("reconcile.hostaway.list_failed", { requestId, listingId, code: res.code });
      continue;
    }
    const reservations: ReservationLike[] = res.data.map((r) => toReservationLike(r, cfg.referenceCustomFieldId));
    for (const r of reservations) {
      const ts = normaliseUpstreamTimestamp(r.updatedOn, now);
      if (ts.skewed) {
        result.skewed++;
        log.warn("reconcile.hostaway.clock_skew", { requestId, reservationId: r.id, skewMs: ts.skewMs });
      }
    }

    for (const b of group) {
      const findings = inspectWriteBack(
        {
          reference: b.reference,
          checkIn: b.check_in,
          checkOut: b.check_out,
          guestEmail: b.guest_email,
          hostawayReservationId: b.hostaway_reservation_id,
        },
        reservations,
      );

      if (findings.duplicates.length) {
        result.duplicates++;
        const ids = [findings.ours!.id, ...findings.duplicates.map((d) => d.id)];
        result.exceptions.push({
          kind: "duplicate_reservation",
          entityType: "reservation",
          entityId: b.id,
          externalId: ids.join(","),
          detail: {
            reference: b.reference,
            reservationIds: ids,
            keep: findings.ours!.id,
            cancel: findings.duplicates.map((d) => d.id),
          },
        });
        await alertCritical("Duplicate Hostaway reservation for one booking", {
          reference: b.reference,
          keep: findings.ours!.id,
          cancel: findings.duplicates.map((d) => d.id),
          action: `Cancel the duplicate(s) in Hostaway, then re-run reconcile-hostaway. Root cause: check hostaway_write_key / attempts on ${b.id}.`,
          requestId,
        });
      }

      if (b.hostaway_reservation_id && findings.missing) {
        result.missing++;
        result.exceptions.push({
          kind: "reservation_missing",
          entityType: "booking",
          entityId: b.id,
          externalId: String(b.hostaway_reservation_id),
          detail: { reference: b.reference, reservationId: b.hostaway_reservation_id },
        });
        await alertCritical("Confirmed booking has no matching reservation in Hostaway", {
          reference: b.reference,
          reservationId: b.hostaway_reservation_id,
          requestId,
        });
        continue;
      }

      if (
        findings.cancelledUpstream &&
        (b.status === "CONFIRMED" || b.status === "CHECKED_IN") &&
        !b.cancelled_upstream
      ) {
        result.cancelledUpstream++;
        await db
          .from("booking_requests")
          .update({ cancelled_upstream: true, cancelled_upstream_at: now.toISOString() })
          .eq("id", b.id)
          .eq("cancelled_upstream", false);
        await db.from("audit_log").insert({
          actor_type: "system",
          action: "booking.cancelled_upstream",
          entity_type: "booking_request",
          entity_id: b.id,
          after: { reservationId: findings.ours!.id, hostawayStatus: findings.ours!.status } as never,
          request_id: requestId,
        });
        result.exceptions.push({
          kind: "cancelled_upstream_refund",
          entityType: "booking",
          entityId: b.id,
          externalId: String(findings.ours!.id),
          detail: {
            reference: b.reference,
            hostawayStatus: findings.ours!.status,
            action: "finance: decide refund / relocation",
          },
        });
        await alertCritical("Reservation cancelled directly in Hostaway — booking marked cancelled-upstream", {
          reference: b.reference,
          reservationId: findings.ours!.id,
          hostawayStatus: findings.ours!.status,
          action: "Call the partner before any email lands; finance to run the refund workflow; offer alternatives.",
          requestId,
        });
        await sendBookingCancelled(
          b,
          l.public_name,
          {
            cancelledBy: "livluxe",
            reason:
              "The reservation was cancelled on the property side. A Live Luxe team member will call you with alternatives.",
            moneyLabel: "Live Luxe finance is reviewing the refund and will confirm it with you directly.",
          },
          requestId,
        );
      }
    }
  }

  await db.from("reconciliation_runs").insert({
    system: "hostaway",
    period_from: null,
    period_to: now.toISOString(),
    summary: {
      examined: result.examined,
      duplicates: result.duplicates,
      cancelledUpstream: result.cancelledUpstream,
      missing: result.missing,
      skewed: result.skewed,
    } as never,
    exceptions: result.exceptions.length,
  });
  await persistExceptions("hostaway", result.exceptions, now);
  const { data: setting } = await db
    .from("settings")
    .select("value")
    .eq("key", "reconciliation.alert_after_hours")
    .maybeSingle();
  await alertStaleExceptions("hostaway", Number(setting?.value ?? 24) || 24, now, requestId);

  if (result.duplicates || result.cancelledUpstream || result.missing)
    await slack(
      "alerts",
      `:mag: Hostaway write-back reconciliation: ${result.examined} booking(s) checked · duplicates ${result.duplicates} · cancelled upstream ${result.cancelledUpstream} · missing ${result.missing}.`,
    );
  log.info("reconcile.hostaway", { requestId, ...result, exceptions: result.exceptions.length });
  return result;
}

export const reconcileHostawayJob: JobFn = async ({ requestId }) => {
  const r = await runHostawayReconciliation(requestId);
  return {
    examined: r.examined,
    changed: r.duplicates + r.cancelledUpstream + r.missing,
    apiCalls: r.apiCalls,
    notes: `duplicates=${r.duplicates} cancelledUpstream=${r.cancelledUpstream} missing=${r.missing} skewed=${r.skewed}`,
  };
};
