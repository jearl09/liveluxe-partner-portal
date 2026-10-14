/**
 * Chargebacks — spec §11.2 (Dispute), §11.3 charge.dispute.created / .closed,
 * §17.2 "Chargeback raised".
 *
 *   created  → mirror locally, alert finance immediately, freeze automated
 *              refunds for the booking, assemble the evidence pack (booking record,
 *              approval trail, invoices, comment thread, check-in access log).
 *   closed   → record the outcome; lift the freeze.
 *
 * The evidence pack is this platform's audit trail — exactly what wins a chargeback.
 */
import "server-only";
import type Stripe from "stripe";
import { adminDb } from "@/lib/db/admin";
import type { DisputeRow } from "@/lib/db/types";
import { alertCritical, slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";

const CLOSED = new Set(["won", "lost", "warning_closed", "charge_refunded"]);

async function bookingForDispute(d: Stripe.Dispute): Promise<string | null> {
  const pi = typeof d.payment_intent === "string" ? d.payment_intent : (d.payment_intent?.id ?? null);
  if (!pi) return null;
  const { data } = await adminDb()
    .from("payments")
    .select("booking_id")
    .eq("stripe_payment_intent_id", pi)
    .maybeSingle();
  return data?.booking_id ?? null;
}

export async function buildEvidencePack(bookingId: string): Promise<Record<string, unknown>> {
  const db = adminDb();
  const [booking, history, invoices, payments, refunds, comments, access, modifications] = await Promise.all([
    db.from("booking_requests").select("*").eq("id", bookingId).maybeSingle(),
    db.from("booking_status_history").select("*").eq("booking_id", bookingId).order("occurred_at"),
    db.from("invoices").select("*").eq("booking_id", bookingId),
    db.from("payments").select("*").eq("booking_id", bookingId),
    db.from("refunds").select("*").eq("booking_id", bookingId),
    db.from("booking_comments").select("*").eq("booking_id", bookingId).order("created_at"),
    db.from("checkin_access_log").select("*").eq("booking_id", bookingId).order("viewed_at"),
    db.from("booking_modifications").select("*").eq("booking_id", bookingId).order("requested_at"),
  ]);
  return {
    builtAt: new Date().toISOString(),
    booking: booking.data,
    approvalTrail: history.data ?? [],
    invoices: invoices.data ?? [],
    payments: payments.data ?? [],
    refunds: refunds.data ?? [],
    comments: comments.data ?? [],
    checkinAccessLog: access.data ?? [],
    modifications: modifications.data ?? [],
  };
}

export async function recordDispute(d: Stripe.Dispute, requestId: string): Promise<DisputeRow> {
  const db = adminDb();
  const { data: existing } = await db.from("disputes").select("*").eq("stripe_dispute_id", d.id).maybeSingle();
  const bookingId = existing?.booking_id ?? (await bookingForDispute(d));
  const now = new Date().toISOString();
  const closed = CLOSED.has(d.status);
  const patch = {
    stripe_dispute_id: d.id,
    booking_id: bookingId,
    status: d.status,
    amount_cents: d.amount,
    reason: d.reason ?? null,
    charge_id: typeof d.charge === "string" ? d.charge : d.charge?.id,
    payment_intent_id: typeof d.payment_intent === "string" ? d.payment_intent : (d.payment_intent?.id ?? null),
    opened_at: existing?.opened_at ?? new Date(d.created * 1000).toISOString(),
    closed_at: closed ? (existing?.closed_at ?? now) : null,
    updated_at: now,
  };
  const { data: row, error } = await db
    .from("disputes")
    .upsert(patch, { onConflict: "stripe_dispute_id" })
    .select("*")
    .single();
  if (error || !row) throw new Error(`disputes upsert failed: ${error?.message}`);

  if (bookingId) {
    if (closed) {
      await db.from("booking_requests").update({ refunds_frozen_at: null }).eq("id", bookingId);
    } else {
      await db
        .from("booking_requests")
        .update({ refunds_frozen_at: now })
        .eq("id", bookingId)
        .is("refunds_frozen_at", null);
      if (!row.evidence_built_at) {
        const evidence = await buildEvidencePack(bookingId);
        await db
          .from("disputes")
          .update({ evidence: evidence as never, evidence_built_at: now })
          .eq("id", row.id);
      }
    }
  }

  if (!existing || existing.status !== d.status) {
    if (closed) {
      await slack(
        "alerts",
        `:scales: Dispute ${d.id} closed: *${d.status}* (${(d.amount / 100).toFixed(2)} ${d.currency.toUpperCase()}).`,
      );
    } else {
      await alertCritical("Stripe dispute opened — automated refunds frozen for this booking", {
        disputeId: d.id,
        bookingId,
        amount: d.amount,
        reason: d.reason,
        status: d.status,
        evidencePack: bookingId ? "assembled on the dispute record" : "no booking matched",
        requestId,
      });
    }
  }
  log.info("stripe.dispute.recorded", { requestId, disputeId: d.id, bookingId, status: d.status });
  return row;
}
