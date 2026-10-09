/**
 * Submit a booking request (spec §7.1, §9.3, §10.1 DRAFT→SUBMITTED).
 *
 * Re-prices the stay server-side, verifies the partner saw the same price (hash),
 * works out the decision deadline in business hours, and hands everything to the
 * atomic submit_booking_request() function. Emails are best-effort: the request
 * exists and is audited before any email is attempted.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import { env } from "@/lib/env";
import { assertAvailable, type StayRequest } from "@/lib/domain/availability";
import { DomainError } from "@/lib/domain/errors";
import { formatMoney } from "@/lib/domain/money";
import type { SessionClaims } from "@/lib/domain/permissions";
import { addBusinessHours, guestsSummary, validateRequestForm, type RequestFormInput } from "@/lib/domain/requests";
import { priceStay } from "@/lib/listings/price";
import { sendEmail } from "@/lib/notifications/email";
import RequestReceived from "@/lib/notifications/templates/request-received";
import { log } from "@/lib/observability/logger";
import { formatDate, formatTimestamp } from "@/lib/utils";
import { rpcErrorToDomain } from "./errors";

export interface SubmitInput {
  listingId: string;
  stay: StayRequest;
  /** Hash of the quote the partner was shown; mismatch → PRICE_CHANGED. */
  priceHash: string | null;
  form: Record<string, string | undefined>;
}

export interface SubmitResult {
  id: string;
  reference: string;
  holdExpiresAt: string;
  decisionDueAt: string;
}

export async function loadOrgRules(orgId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("partner_orgs")
    .select("name, require_claim_ref, require_po_number, sla_hours, default_po_number, default_cost_centre, status")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(`partner_orgs read failed: ${error.message}`);
  if (!data) throw new DomainError("NOT_FOUND", { orgId });
  return data;
}

export async function submitRequest(
  claims: SessionClaims,
  input: SubmitInput,
  requestId: string,
): Promise<SubmitResult> {
  const supabase = await createServerSupabase();
  const org = await loadOrgRules(claims.org_id);
  if (org.status !== "active") throw new DomainError("ORG_SUSPENDED");

  const validation = validateRequestForm(input.form, {
    requireClaimRef: org.require_claim_ref,
    requirePoNumber: org.require_po_number,
  });
  if (!validation.ok) throw new DomainError("VALIDATION_FAILED", { fields: validation.errors });
  const form: RequestFormInput = validation.values;

  const priced = await priceStay(input.listingId, input.stay);
  if (!priced) throw new DomainError("NOT_FOUND", { listingId: input.listingId });
  assertAvailable(priced.availability, input.listingId);
  if (!priced.quote) throw new DomainError("VALIDATION_FAILED", { reason: "price_on_application" });
  if (input.priceHash && input.priceHash !== priced.quote.priceHash) {
    throw new DomainError("PRICE_CHANGED", { newTotalCents: priced.quote.totalCents });
  }

  const { data: policyRows, error: policyErr } = await supabase.rpc("request_policy");
  if (policyErr) throw new Error(`request_policy failed: ${policyErr.message}`);
  const policy = policyRows?.[0];
  const slaHours = Number(org.sla_hours ?? policy?.sla_default_hours ?? 4);
  const now = new Date();
  const decisionDueAt = addBusinessHours(
    now.toISOString(),
    slaHours,
    policy?.sla_business_hours ?? { start: "08:00", end: "18:00", timezone: "Australia/Melbourne" },
  );

  const q = priced.quote;
  const { data, error } = await supabase.rpc("submit_booking_request", {
    p_listing_id: input.listingId,
    p_check_in: input.stay.checkIn,
    p_check_out: input.stay.checkOut,
    p_adults: input.stay.adults,
    p_children: input.stay.children,
    p_pets: input.stay.pets,
    p_line_items: q.lines as never,
    p_subtotal_cents: q.subtotalCents,
    p_tax_cents: q.taxCents,
    p_total_cents: q.totalCents,
    p_deposit_cents: q.securityDepositCents,
    p_price_hash: q.priceHash,
    p_rate_card_id: q.rateCardId,
    p_rate_card_version: q.rateCardVersion,
    p_guest_name: form.guestName,
    p_guest_email: form.guestEmail,
    p_guest_phone: form.guestPhone,
    p_claim_ref: form.claimRef,
    p_po_number: form.poNumber,
    p_cost_centre: form.costCentre,
    p_notes: form.notes,
    p_decision_due_at: decisionDueAt,
  });
  if (error) throw rpcErrorToDomain(error);
  const row = data?.[0];
  if (!row) throw new Error("submit_booking_request returned no row");

  log.info("booking.submitted", {
    requestId,
    userId: claims.sub,
    orgId: claims.org_id,
    reference: row.reference,
    totalCents: q.totalCents,
  });

  // Best-effort confirmation email (Appendix D: request_received).
  if (claims.email) {
    const listing = priced.detail.listing;
    try {
      await sendEmail({
        to: claims.email,
        subject: `Request received — ${row.reference}`,
        idempotencyKey: `request_received:${row.id}`,
        tags: { type: "request_received" },
        template: RequestReceived({
          reference: row.reference,
          propertyName: listing.public_name,
          checkIn: formatDate(input.stay.checkIn),
          checkOut: formatDate(input.stay.checkOut),
          nights: q.nights,
          guestsSummary: guestsSummary(input.stay.adults, input.stay.children, input.stay.pets),
          totalFormatted: formatMoney(q.totalCents, listing.currency),
          claimRef: form.claimRef || undefined,
          poNumber: form.poNumber || undefined,
          submittedAtLabel: formatTimestamp(now.toISOString()),
          slaLabel: `within ${slaHours} business hours`,
          requestUrl: `${env().NEXT_PUBLIC_APP_URL}/requests/${row.id}`,
          supportEmail: env().EMAIL_REPLY_TO,
        }),
      });
    } catch (e) {
      log.warn("booking.email_skipped", {
        requestId,
        reference: row.reference,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    id: row.id,
    reference: row.reference,
    holdExpiresAt: row.hold_expires_at,
    decisionDueAt: row.decision_due_at,
  };
}
