/**
 * Stripe Invoices — spec §11.5. Stripe hosts the PDF and the payment page; we
 * never rebuild either. Two uses:
 *   - mode C: net-terms invoice, emailed by Stripe, paid by card or BECS;
 *   - mode A: a paid tax invoice issued after the card capture so every
 *     confirmed booking has a sequential invoice number and a PDF.
 * Idempotent on the booking id: a second call returns the existing invoice.
 */
import "server-only";
import type Stripe from "stripe";
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow, InvoiceRow } from "@/lib/db/types";
import { invoiceItemsFromQuote, paymentKeys } from "@/lib/domain/payments";
import type { QuoteLine } from "@/lib/domain/quote-engine";
import { getStripe } from "@/lib/stripe/client";
import { log } from "@/lib/observability/logger";
import { ensureStripeCustomer, loadOrgBilling, type OrgBilling } from "./customers";

export interface InvoiceSource {
  booking: BookingRequestRow;
  org: OrgBilling;
  propertyName: string;
  quote: { lines: QuoteLine[]; taxCents: number; totalCents: number } | null;
  payerEmail?: string | null;
}

export async function invoiceForBooking(bookingId: string): Promise<InvoiceRow | null> {
  const { data, error } = await adminDb()
    .from("invoices")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`invoices read failed: ${error.message}`);
  return data;
}

/** Mirror one Stripe invoice. Returns null when it is not linked to a booking or org we know. */
export async function syncInvoice(source: string | Stripe.Invoice): Promise<InvoiceRow | null> {
  const inv = typeof source === "string" ? await getStripe().invoices.retrieve(source) : source;
  const db = adminDb();
  const { data: existing } = await db.from("invoices").select("*").eq("stripe_invoice_id", inv.id).maybeSingle();
  const orgId = existing?.org_id ?? inv.metadata?.org_id;
  if (!orgId) {
    log.info("stripe.invoice.not_ours", { invoiceId: inv.id });
    return null;
  }
  const now = new Date().toISOString();
  const paidAt = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000).toISOString() : null;
  const patch = {
    org_id: orgId,
    booking_id: existing?.booking_id ?? inv.metadata?.booking_id ?? null,
    stripe_invoice_id: inv.id,
    number: inv.number ?? existing?.number ?? null,
    status: inv.status ?? "draft",
    amount_due_cents: inv.amount_due,
    amount_paid_cents: inv.amount_paid,
    currency: inv.currency.toUpperCase(),
    due_at: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
    hosted_url: inv.hosted_invoice_url ?? existing?.hosted_url ?? null,
    pdf_url: inv.invoice_pdf ?? existing?.pdf_url ?? null,
    sent_at: existing?.sent_at ?? (inv.status === "open" || inv.status === "paid" ? now : null),
    paid_at: paidAt ?? existing?.paid_at ?? null,
    updated_at: now,
  };
  const { data, error } = await db
    .from("invoices")
    .upsert(patch, { onConflict: "stripe_invoice_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error(`invoices upsert failed: ${error?.message}`);
  return data;
}

/** §11.5 custom fields: what lets the partner's AP team match and pay without calling. Stripe allows four. */
function customFields(b: BookingRequestRow, propertyName: string): Stripe.InvoiceCreateParams.CustomField[] {
  const fields: { name: string; value: string | null }[] = [
    { name: "Booking", value: b.reference },
    { name: "Claim ref", value: b.claim_ref },
    { name: "PO number", value: b.po_number },
    { name: "Stay", value: `${propertyName} ${b.check_in} to ${b.check_out}`.slice(0, 140) },
  ];
  return fields.filter((f): f is { name: string; value: string } => !!f.value).slice(0, 4);
}

/**
 * Create, itemise and finalise the invoice. `collection` decides the rest:
 *   send_invoice      → Stripe emails it; due in `daysUntilDue` (mode C).
 *   paid_out_of_band  → marked paid immediately (receipt for a captured card payment).
 */
export async function issueInvoice(
  src: InvoiceSource,
  opts: { collection: "send_invoice"; daysUntilDue: number } | { collection: "paid_out_of_band" },
): Promise<InvoiceRow> {
  const existing = await invoiceForBooking(src.booking.id);
  if (existing) return existing;

  const stripe = getStripe();
  const b = src.booking;
  const customer = await ensureStripeCustomer(src.org, src.payerEmail);
  const key = paymentKeys.invoice(b.id);
  const sendInvoice = opts.collection === "send_invoice";

  const draft = await stripe.invoices.create(
    {
      customer,
      collection_method: sendInvoice ? "send_invoice" : "charge_automatically",
      ...(sendInvoice ? { days_until_due: opts.daysUntilDue } : {}),
      auto_advance: false,
      pending_invoice_items_behavior: "exclude",
      currency: b.currency.toLowerCase(),
      description: `Accommodation: ${src.propertyName}, ${b.check_in} to ${b.check_out} (${b.nights} nights). Guest: ${b.guest_name ?? "see booking"}.`,
      custom_fields: customFields(b, src.propertyName),
      footer: `Booking ${b.reference}. Questions: reply to this email. Live Luxe Pty Ltd.`,
      metadata: { booking_id: b.id, booking_reference: b.reference, org_id: b.org_id },
    },
    { idempotencyKey: `${key}:create` },
  );

  const items =
    src.quote && src.quote.lines.length
      ? invoiceItemsFromQuote(src.quote.lines, src.quote.taxCents)
      : [{ description: `Accommodation ${b.reference}`, amountCents: b.total_cents ?? 0 }];
  let i = 0;
  for (const item of items) {
    await stripe.invoiceItems.create(
      {
        customer,
        invoice: draft.id,
        amount: item.amountCents,
        currency: b.currency.toLowerCase(),
        description: item.description,
      },
      { idempotencyKey: `${key}:item:${i++}` },
    );
  }

  let inv = await stripe.invoices.finalizeInvoice(draft.id, {}, { idempotencyKey: `${key}:finalize` });
  if (sendInvoice) {
    inv = await stripe.invoices.sendInvoice(inv.id, {}, { idempotencyKey: `${key}:send` });
  } else {
    inv = await stripe.invoices.pay(inv.id, { paid_out_of_band: true }, { idempotencyKey: `${key}:paid` });
  }
  const row = await syncInvoice(inv);
  if (!row) throw new Error("invoice sync returned null for a booking invoice");
  log.info("stripe.invoice.issued", {
    reference: b.reference,
    invoiceId: inv.id,
    number: inv.number,
    collection: opts.collection,
  });
  return row;
}

/** Mode C gate: what the org still owes on open invoices (§11.1 credit_limit_cents). */
export async function outstandingInvoiceCents(orgId: string): Promise<number> {
  const { data, error } = await adminDb()
    .from("invoices")
    .select("amount_due_cents, amount_paid_cents")
    .eq("org_id", orgId)
    .in("status", ["open", "uncollectible"]);
  if (error) throw new Error(`invoices read failed: ${error.message}`);
  return (data ?? []).reduce((sum, r) => sum + Math.max(0, r.amount_due_cents - r.amount_paid_cents), 0);
}

export { loadOrgBilling };
