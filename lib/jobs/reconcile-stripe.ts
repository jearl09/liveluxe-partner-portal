/**
 * reconcile-stripe — spec §11.6. Nightly proof that the platform's view of money
 * matches Stripe's. Pulls the period's balance transactions, resolves each to the
 * PaymentIntent / Refund / Dispute it came from, hands everything to the pure
 * reconciler, persists the report and the CSV, upserts exceptions (so their age is
 * known), resolves exceptions that cleared, and raises HIGH for anything unmatched
 * older than `reconciliation.alert_after_hours`.
 */
import type Stripe from "stripe";
import { adminDb } from "@/lib/db/admin";
import {
  reconcileStripe,
  staleExceptions,
  type ReconBalanceTxn,
  type ReconException,
} from "@/lib/domain/reconciliation";
import { slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { getStripe } from "@/lib/stripe/client";
import type { JobFn } from "./registry";

/** 25 h back covers a daily cadence with jitter; the exception table de-duplicates overlaps. */
const PERIOD_MS = 25 * 3_600_000;

function sourceIds(txn: Stripe.BalanceTransaction): {
  pi: string | null;
  refund: string | null;
  dispute: string | null;
} {
  const src = txn.source;
  if (!src || typeof src === "string") {
    const id = typeof src === "string" ? src : null;
    return {
      pi: null,
      refund: id?.startsWith("re_") ? id : null,
      dispute: id?.startsWith("du_") || id?.startsWith("dp_") ? id : null,
    };
  }
  const obj = src as { object?: string; id: string; payment_intent?: string | { id: string } | null };
  const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : (obj.payment_intent?.id ?? null);
  if (obj.object === "charge") return { pi, refund: null, dispute: null };
  if (obj.object === "refund") return { pi, refund: obj.id, dispute: null };
  if (obj.object === "dispute") return { pi, refund: null, dispute: obj.id };
  return { pi, refund: null, dispute: null };
}

export async function fetchBalanceTxns(from: Date, to: Date): Promise<ReconBalanceTxn[]> {
  const stripe = getStripe();
  const out: ReconBalanceTxn[] = [];
  for await (const t of stripe.balanceTransactions.list({
    created: { gte: Math.floor(from.getTime() / 1000), lte: Math.floor(to.getTime() / 1000) },
    expand: ["data.source"],
    limit: 100,
  })) {
    const ids = sourceIds(t);
    out.push({
      id: t.id,
      type: t.type,
      amountCents: t.amount,
      feeCents: t.fee,
      netCents: t.net,
      currency: t.currency,
      createdAt: new Date(t.created * 1000).toISOString(),
      paymentIntentId: ids.pi,
      refundId: ids.refund,
      disputeId: ids.dispute,
      description: t.description ?? null,
    });
  }
  return out;
}

export async function runStripeReconciliation(requestId: string, now = new Date()) {
  const db = adminDb();
  const periodFrom = new Date(now.getTime() - PERIOD_MS);
  const [bookings, payments, invoices, refunds, disputes, setting] = await Promise.all([
    db
      .from("booking_requests")
      .select("id, reference, status, confirmed_at")
      .not("status", "in", "(DRAFT,DECLINED,EXPIRED)")
      .limit(5000),
    db
      .from("payments")
      .select("booking_id, stripe_payment_intent_id, status, amount_captured_cents, captured_at, authorised_at")
      .limit(5000),
    db
      .from("invoices")
      .select("booking_id, stripe_invoice_id, status, amount_paid_cents, amount_due_cents, due_at, kind")
      .limit(5000),
    db.from("refunds").select("booking_id, stripe_refund_id, amount_cents, status, approved_by").limit(5000),
    db.from("disputes").select("stripe_dispute_id, booking_id, status, amount_cents").limit(1000),
    db.from("settings").select("value").eq("key", "reconciliation.alert_after_hours").maybeSingle(),
  ]);
  for (const r of [bookings, payments, invoices, refunds, disputes]) if (r.error) throw new Error(r.error.message);

  const balanceTxns = await fetchBalanceTxns(periodFrom, now);
  const report = reconcileStripe({
    bookings: (bookings.data ?? []).map((b) => ({
      id: b.id,
      reference: b.reference,
      status: b.status,
      confirmedAt: b.confirmed_at,
    })),
    payments: (payments.data ?? []).map((p) => ({
      bookingId: p.booking_id,
      paymentIntentId: p.stripe_payment_intent_id,
      status: p.status,
      capturedCents: p.amount_captured_cents,
      capturedAt: p.captured_at,
      authorisedAt: p.authorised_at,
    })),
    invoices: (invoices.data ?? []).map((i) => ({
      bookingId: i.booking_id,
      invoiceId: i.stripe_invoice_id,
      status: i.status,
      paidCents: i.amount_paid_cents,
      dueCents: i.amount_due_cents,
      dueAt: i.due_at,
      kind: i.kind,
    })),
    refunds: (refunds.data ?? []).map((r) => ({
      bookingId: r.booking_id,
      refundId: r.stripe_refund_id,
      amountCents: r.amount_cents,
      status: r.status,
      approvedBy: r.approved_by,
    })),
    disputes: (disputes.data ?? []).map((d) => ({
      disputeId: d.stripe_dispute_id,
      bookingId: d.booking_id,
      status: d.status,
      amountCents: d.amount_cents,
    })),
    balanceTxns,
    periodFrom: periodFrom.toISOString(),
    periodTo: now.toISOString(),
    now,
  });

  const { data: run, error: runErr } = await db
    .from("reconciliation_runs")
    .insert({
      system: "stripe",
      period_from: periodFrom.toISOString(),
      period_to: now.toISOString(),
      summary: report.summary as never,
      exceptions: report.exceptions.length,
      csv: report.csv,
    })
    .select("id")
    .single();
  if (runErr) throw new Error(`reconciliation_runs insert failed: ${runErr.message}`);

  await persistExceptions("stripe", report.exceptions, now);
  const alerted = await alertStaleExceptions("stripe", Number(setting.data?.value ?? 24) || 24, now, requestId);

  const s = report.summary;
  log.info("reconcile.stripe", { requestId, runId: run.id, ...s });
  await slack(
    s.exceptions ? "alerts" : "bookings",
    `:ledger: Stripe reconciliation: gross ${money(s.grossCents)}, fees ${money(s.feesCents)}, net ${money(s.netCents)}, refunds ${money(s.refundsCents)}, disputes ${money(s.disputesCents)} · ${s.matchedTxns} matched, ${s.unmatchedTxns} unmatched · ${s.outstandingAuthorisations} open authorisation(s) · ${s.overdueInvoices} overdue invoice(s) · ${s.exceptions} exception(s).`,
  );
  return { runId: run.id, summary: s, exceptions: report.exceptions, alerted };
}

export async function persistExceptions(system: "stripe" | "hostaway", found: ReconException[], now: Date) {
  const db = adminDb();
  const nowIso = now.toISOString();
  for (const e of found) {
    await db.from("reconciliation_exceptions").upsert(
      {
        system,
        kind: e.kind,
        entity_type: e.entityType,
        entity_id: e.entityId,
        external_id: e.externalId,
        detail: e.detail as never,
        last_seen_at: nowIso,
        resolved_at: null,
      },
      { onConflict: "system,kind,entity_type,entity_id" },
    );
  }
  // Anything open that this run did not see again has cleared.
  const { data: open } = await db
    .from("reconciliation_exceptions")
    .select("id, kind, entity_type, entity_id")
    .eq("system", system)
    .is("resolved_at", null);
  const seen = new Set(found.map((e) => `${e.kind}|${e.entityType}|${e.entityId}`));
  const cleared = (open ?? []).filter((x) => !seen.has(`${x.kind}|${x.entity_type}|${x.entity_id}`));
  if (cleared.length)
    await db
      .from("reconciliation_exceptions")
      .update({ resolved_at: nowIso })
      .in(
        "id",
        cleared.map((c) => c.id),
      );
  return { upserted: found.length, resolved: cleared.length };
}

export async function alertStaleExceptions(
  system: "stripe" | "hostaway",
  afterHours: number,
  now: Date,
  requestId: string,
) {
  const db = adminDb();
  const { data: open } = await db
    .from("reconciliation_exceptions")
    .select("id, kind, entity_type, entity_id, first_seen_at, resolved_at, alerted_at, detail")
    .eq("system", system)
    .is("resolved_at", null)
    .is("alerted_at", null);
  const stale = staleExceptions(
    (open ?? []).map((x) => ({
      ...x,
      firstSeenAt: x.first_seen_at,
      resolvedAt: x.resolved_at,
      alertedAt: x.alerted_at,
    })),
    now,
    afterHours,
  );
  if (!stale.length) return 0;
  await db
    .from("reconciliation_exceptions")
    .update({ alerted_at: now.toISOString() })
    .in(
      "id",
      stale.map((s) => s.id),
    );
  const lines = stale
    .slice(0, 20)
    .map((s) => `• ${s.kind} ${s.entity_type} ${s.entity_id}`)
    .join("\n");
  log.error("reconcile.stale_exceptions", { requestId, system, count: stale.length });
  await slack(
    "alerts",
    `:warning: *HIGH* ${stale.length} ${system} reconciliation exception(s) unresolved for over ${afterHours} h:\n${lines}`,
  );
  return stale.length;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export const reconcileStripeJob: JobFn = async ({ requestId }) => {
  const r = await runStripeReconciliation(requestId);
  return {
    examined: r.summary.matchedTxns + r.summary.unmatchedTxns,
    changed: r.exceptions.length,
    notes: `run=${r.runId} exceptions=${r.exceptions.length} alerted=${r.alerted}`,
  };
};
