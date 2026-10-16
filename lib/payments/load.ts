/**
 * Read models for payment state on the partner and ops screens. Goes through
 * the session client so RLS scopes rows: a partner sees only their own org's
 * payments and invoices (policies payments_select / invoices_select).
 */
import { partnerPropertyName } from "@/lib/domain/property-name";
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { InvoiceRow, PaymentRow, RefundRow } from "@/lib/db/types";
import { paymentStateFromStripe, type PaymentState, type PaymentTerms } from "@/lib/domain/payments";

export interface PaymentView {
  state: PaymentState | null;
  row: PaymentRow | null;
  invoice: InvoiceRow | null;
  /** Newest first; RLS-scoped like payments. */
  refunds: RefundRow[];
}

export async function paymentViewForBooking(bookingId: string): Promise<PaymentView> {
  const supabase = await createServerSupabase();
  const [payment, invoice, refunds] = await Promise.all([
    supabase
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("invoices")
      .select("*")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("refunds").select("*").eq("booking_id", bookingId).order("created_at", { ascending: false }),
  ]);
  const row = payment.data ?? null;
  return {
    row,
    state: row ? paymentStateFromStripe(row.status, row.failure_code) : null,
    invoice: invoice.data ?? null,
    refunds: refunds.data ?? [],
  };
}

export interface InvoiceListItem {
  invoice: InvoiceRow;
  bookingReference: string | null;
  propertyName: string | null;
}

/** Every invoice the caller may see, newest first, with the booking it belongs to. */
export async function listInvoices(): Promise<InvoiceListItem[]> {
  const supabase = await createServerSupabase();
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`invoices read failed: ${error.message}`);
  const bookingIds = [...new Set((invoices ?? []).map((i) => i.booking_id).filter((x): x is string => !!x))];
  const { data: bookings } = bookingIds.length
    ? await supabase.from("booking_requests").select("id, reference, listing_id").in("id", bookingIds)
    : { data: [] as { id: string; reference: string; listing_id: string }[] };
  const listingIds = [...new Set((bookings ?? []).map((b) => b.listing_id))];
  const { data: listings } = listingIds.length
    ? await supabase.from("listings").select("id, public_name, internal_name").in("id", listingIds)
    : { data: [] as { id: string; public_name: string; internal_name: string | null }[] };
  const byBooking = new Map((bookings ?? []).map((b) => [b.id, b]));
  const byListing = new Map((listings ?? []).map((l) => [l.id, partnerPropertyName(l.public_name, l.internal_name)]));
  return (invoices ?? []).map((invoice) => {
    const b = invoice.booking_id ? byBooking.get(invoice.booking_id) : undefined;
    return {
      invoice,
      bookingReference: b?.reference ?? null,
      propertyName: b ? (byListing.get(b.listing_id) ?? null) : null,
    };
  });
}

/** The org's payment terms, readable by the org's own users and by Live Luxe (RLS). */
export async function orgPaymentTerms(orgId: string): Promise<PaymentTerms | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("partner_orgs").select("payment_terms").eq("id", orgId).maybeSingle();
  return data?.payment_terms ?? null;
}
