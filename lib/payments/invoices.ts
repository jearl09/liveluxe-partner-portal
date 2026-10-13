/**
 * Stripe Invoices — spec §11.5. Stripe hosts the PDF and the payment page; we
 * never rebuild either. Four kinds, all idempotent on a derived key:
 *   receipt        mode A/B: a paid tax invoice for a captured card payment
 *   net_terms      mode C: the booking invoice, emailed by Stripe, net 14/30
 *   balance        mode B: the balance after the deposit, due before check-in
 *   supplementary  an approved extension's extra nights (§10.6)
 */
import "server-only";
import type Stripe from "stripe";
import { adminDb } from "@/lib/db/admin";
import type { BookingRequestRow, InvoiceRow } from "@/lib/db/types";
import { invoiceItemsFromQuote, paymentKeys, type InvoiceItem } from "@/lib/domain/payments";
import type { QuoteLine } from "@/lib/domain/quote-engine";
import { getStripe } from "@/lib/stripe/client";
import { log } from "@/lib/observability/logger";
import { ensureStripeCustomer, loadOrgBilling, type OrgBilling } from "./customers";

export type InvoiceKind = InvoiceRow["kind"];

export interface InvoiceSource {
  booking: BookingRequestRow;
  org: OrgBilling;
  propertyName: string;
  quote: { lines: QuoteLine[]; taxCents: number; totalCents: number } | null;
  payerEmail?: string | null;
}

export async function invoiceForBooking(bookingId: string, kind?: InvoiceKind): Promise<InvoiceRow | null> {
  let q = adminDb().from("invoices").select("*").eq("booking_id", bookingId);
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`invoices read failed: ${error.message}`);
  return data;
}

export async function invoicesForBooking(bookingId: string): Promise<InvoiceRow[]> {
  const { data, error } = await adminDb()
    .from("invoices")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`invoices read failed: ${error.message}`);
  return data ?? [];
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
  const kind = (existing?.kind ?? inv.metadata?.kind ?? "receipt") as InvoiceKind;
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
    kind,
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

type Collection =
  | { collection: "send_invoice"; daysUntilDue: number }
  | { collection: "send_invoice"; dueDate: string }
  | { collection: "paid_out_of_band" };

async function createAndFinalise(args: {
  src: InvoiceSource;
  key: string;
  kind: InvoiceKind;
  items: InvoiceItem[];
  description: string;
  how: Collection;
  metadata?: Record<string, string>;
}): Promise<InvoiceRow> {
  const stripe = getStripe();
  const b = args.src.booking;
  const customer = await ensureStripeCustomer(args.src.org, args.src.payerEmail);
  const sendInvoice = args.how.collection === "send_invoice";

  const draft = await stripe.invoices.create(
    {
      customer,
      collection_method: sendInvoice ? "send_invoice" : "charge_automatically",
      ...(args.how.collection === "send_invoice" && "daysUntilDue" in args.how
        ? { days_until_due: args.how.daysUntilDue }
        : {}),
      ...(args.how.collection === "send_invoice" && "dueDate" in args.how
        ? { due_date: Math.floor(Date.parse(`${args.how.dueDate}T00:00:00Z`) / 1000) }
        : {}),
      auto_advance: false,
      pending_invoice_items_behavior: "exclude",
      currency: b.currency.toLowerCase(),
      description: args.description,
      custom_fields: customFields(b, args.src.propertyName),
      footer: `Booking ${b.reference}. Questions: reply to this email. Live Luxe Pty Ltd.`,
      metadata: {
        booking_id: b.id,
        booking_reference: b.reference,
        org_id: b.org_id,
        kind: args.kind,
        ...args.metadata,
      },
    },
    { idempotencyKey: `${args.key}:create` },
  );

  let i = 0;
  for (const item of args.items) {
    if (item.amountCents === 0) continue;
    await stripe.invoiceItems.create(
      {
        customer,
        invoice: draft.id,
        amount: item.amountCents,
        currency: b.currency.toLowerCase(),
        description: item.description,
      },
      { idempotencyKey: `${args.key}:item:${i++}` },
    );
  }

  let inv = await stripe.invoices.finalizeInvoice(draft.id, {}, { idempotencyKey: `${args.key}:finalize` });
  if (sendInvoice) {
    inv = await stripe.invoices.sendInvoice(inv.id, {}, { idempotencyKey: `${args.key}:send` });
  } else {
    inv = await stripe.invoices.pay(inv.id, { paid_out_of_band: true }, { idempotencyKey: `${args.key}:paid` });
  }
  const row = await syncInvoice(inv);
  if (!row) throw new Error("invoice sync returned null for a booking invoice");
  log.info("stripe.invoice.issued", {
    reference: b.reference,
    invoiceId: inv.id,
    number: inv.number,
    kind: args.kind,
    collection: args.how.collection,
  });
  return row;
}

function stayItems(src: InvoiceSource): InvoiceItem[] {
  const b = src.booking;
  return src.quote && src.quote.lines.length
    ? invoiceItemsFromQuote(src.quote.lines, src.quote.taxCents)
    : [{ description: `Accommodation ${b.reference}`, amountCents: b.total_cents ?? 0 }];
}

function stayDescription(src: InvoiceSource): string {
  const b = src.booking;
  return `Accommodation: ${src.propertyName}, ${b.check_in} to ${b.check_out} (${b.nights} nights). Guest: ${b.guest_name ?? "see booking"}.`;
}

/**
 * The booking's main invoice. `collection` decides the rest:
 *   send_invoice      → Stripe emails it; due in `daysUntilDue` (mode C net terms).
 *   paid_out_of_band  → marked paid immediately (receipt for a captured card payment).
 * Idempotent on the booking id: a second call returns the existing invoice.
 */
export async function issueInvoice(
  src: InvoiceSource,
  opts: { collection: "send_invoice"; daysUntilDue: number } | { collection: "paid_out_of_band" },
): Promise<InvoiceRow> {
  const kind: InvoiceKind = opts.collection === "send_invoice" ? "net_terms" : "receipt";
  const existing = await invoiceForBooking(src.booking.id, kind);
  if (existing) return existing;
  return createAndFinalise({
    src,
    key: paymentKeys.invoice(src.booking.id),
    kind,
    items: stayItems(src),
    description: stayDescription(src),
    how: opts,
  });
}

/** Mode B (§11.1 B): receipt for the deposit taken at approval. */
export async function issueDepositReceipt(src: InvoiceSource, depositCents: number, pct: number): Promise<InvoiceRow> {
  const existing = await invoiceForBooking(src.booking.id, "receipt");
  if (existing) return existing;
  return createAndFinalise({
    src,
    key: paymentKeys.invoice(src.booking.id),
    kind: "receipt",
    items: [{ description: `Deposit (${pct}%) — ${stayDescription(src)}`, amountCents: depositCents }],
    description: `Deposit for ${src.propertyName}, ${src.booking.check_in} to ${src.booking.check_out}.`,
    how: { collection: "paid_out_of_band" },
  });
}

/** Mode B: the balance, itemised as the stay less the deposit, due before check-in. */
export async function issueBalanceInvoice(
  src: InvoiceSource,
  args: { depositCents: number; dueDate: string },
): Promise<InvoiceRow> {
  const existing = await invoiceForBooking(src.booking.id, "balance");
  if (existing) return existing;
  const items = [...stayItems(src), { description: "Less deposit received", amountCents: -args.depositCents }];
  return createAndFinalise({
    src,
    key: paymentKeys.balanceInvoice(src.booking.id),
    kind: "balance",
    items,
    description: `Balance for ${stayDescription(src)}`,
    how: { collection: "send_invoice", dueDate: args.dueDate },
  });
}

/** §10.6 extension: a supplementary invoice for the added nights only. */
export async function issueSupplementaryInvoice(
  src: InvoiceSource,
  args: { modificationId: string; items: InvoiceItem[]; nights: number; newCheckOut: string; daysUntilDue: number },
): Promise<InvoiceRow> {
  const { data: mod } = await adminDb()
    .from("booking_modifications")
    .select("invoice_id")
    .eq("id", args.modificationId)
    .maybeSingle();
  if (mod?.invoice_id) {
    const { data } = await adminDb().from("invoices").select("*").eq("id", mod.invoice_id).maybeSingle();
    if (data) return data;
  }
  return createAndFinalise({
    src,
    key: paymentKeys.supplementaryInvoice(args.modificationId),
    kind: "supplementary",
    items: args.items,
    description: `Extension: ${src.propertyName}, ${args.nights} additional night(s) to ${args.newCheckOut}.`,
    how: { collection: "send_invoice", daysUntilDue: args.daysUntilDue },
    metadata: { modification_id: args.modificationId },
  });
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
