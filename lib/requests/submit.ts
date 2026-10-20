/**
 * Submit a booking request (spec §7.1, §9.3, §10.1 DRAFT→SUBMITTED).
 *
 * Re-prices the stay server-side, verifies the partner saw the same price (hash),
 * works out the decision deadline in business hours, and hands everything to the
 * atomic submit_booking_request() function. Emails are best-effort: the request
 * exists and is audited before any email is attempted.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import { createServerSupabase } from "@/lib/db/server";
import { env } from "@/lib/env";
import { assertAvailable, type StayRequest } from "@/lib/domain/availability";
import { DomainError, isDomainError } from "@/lib/domain/errors";
import { partnerPropertyName } from "@/lib/domain/property-name";
import { formatMoney } from "@/lib/domain/money";
import {
  creditCheck,
  parseOverLimitAction,
  paymentModeFor,
  submissionCreditDecision,
  type CreditStanding,
} from "@/lib/domain/payments";
import type { SessionClaims } from "@/lib/domain/permissions";
import {
  addBusinessHours,
  guestsSummary,
  replyPromise,
  validateRequestForm,
  type RequestFormInput,
} from "@/lib/domain/requests";
import { priceStay } from "@/lib/listings/price";
import { sendEmail } from "@/lib/notifications/email";
import { slack } from "@/lib/notifications/slack";
import RequestReceived from "@/lib/notifications/templates/request-received";
import { log } from "@/lib/observability/logger";
import { outstandingInvoiceCents } from "@/lib/payments/invoices";
import { formatDate, formatTimestamp } from "@/lib/utils";
import { rpcErrorToDomain } from "./errors";

export interface SubmitInput {
  listingId: string;
  stay: StayRequest;
  /** Hash of the quote the partner was shown; mismatch → PRICE_CHANGED. */
  priceHash: string | null;
  form: Record<string, string | undefined>;
  /**
   * §17.2 "Duplicate submission": a key minted when the form was rendered. A second
   * submit with the same key (double-click, browser retry) returns the first result.
   */
  submissionKey?: string | null;
}

export interface SubmitResult {
  id: string;
  reference: string;
  holdExpiresAt: string;
  decisionDueAt: string;
  /** True when the same key had already produced this request. */
  duplicate?: boolean;
  /** True when the credit configuration routed the request to Live Luxe finance. */
  financeApproval?: boolean;
}

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

async function existingBySubmissionKey(orgId: string, key: string): Promise<SubmitResult | null> {
  const { data } = await adminDb()
    .from("booking_requests")
    .select("id, reference, hold_expires_at, decision_due_at, finance_approval_required")
    .eq("org_id", orgId)
    .eq("submission_key", key)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    reference: data.reference,
    holdExpiresAt: data.hold_expires_at ?? "",
    decisionDueAt: data.decision_due_at ?? "",
    duplicate: true,
    financeApproval: data.finance_approval_required,
  };
}

/**
 * §17.2 "Partner exceeds credit limit" / "Invoice unpaid past terms": decide at submission,
 * before any hold is placed, whether this request is fine, needs finance, or is blocked.
 */
export async function creditDecisionForSubmission(orgId: string, newCents: number) {
  const db = adminDb();
  const [{ data: org }, { data: setting }, outstanding] = await Promise.all([
    db
      .from("partner_orgs")
      .select("name, payment_terms, credit_limit_cents, credit_standing, finance_contact_email, status")
      .eq("id", orgId)
      .maybeSingle(),
    db.from("settings").select("value").eq("key", "credit.over_limit_action").maybeSingle(),
    outstandingInvoiceCents(orgId),
  ]);
  if (!org) throw new DomainError("NOT_FOUND", { orgId });
  const mode = paymentModeFor(org.payment_terms);
  const check = creditCheck({ outstandingCents: outstanding, newCents, limitCents: org.credit_limit_cents });
  const decision = submissionCreditDecision({
    mode,
    check,
    action: parseOverLimitAction(setting?.value),
    creditStanding: (org.credit_standing ?? "good") as CreditStanding,
  });
  return { ...decision, org, check, outstanding, mode };
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

  const submissionKey = input.submissionKey && KEY_RE.test(input.submissionKey) ? input.submissionKey : null;
  if (submissionKey) {
    const dup = await existingBySubmissionKey(claims.org_id, submissionKey);
    if (dup) {
      log.info("booking.submit_duplicate", { requestId, reference: dup.reference, key: submissionKey });
      return dup;
    }
  }

  const validation = validateRequestForm(input.form, {
    requireClaimRef: org.require_claim_ref,
    requirePoNumber: org.require_po_number,
  });
  if (!validation.ok) throw new DomainError("VALIDATION_FAILED", { fields: validation.errors });
  const form: RequestFormInput = validation.values;

  const priced = await priceStay(input.listingId, input.stay, { orgId: claims.org_id });
  if (!priced) throw new DomainError("NOT_FOUND", { listingId: input.listingId });
  assertAvailable(priced.availability, input.listingId);
  if (!priced.quote) throw new DomainError("VALIDATION_FAILED", { reason: "price_on_application" });
  if (input.priceHash && input.priceHash !== priced.quote.priceHash) {
    throw new DomainError("PRICE_CHANGED", { newTotalCents: priced.quote.totalCents });
  }

  // Credit gate before anything is held (§17.2). Blocked requests name the finance contact.
  const credit = await creditDecisionForSubmission(claims.org_id, priced.quote.totalCents);
  if (credit.outcome === "block") {
    const contact = credit.org.finance_contact_email ?? env().EMAIL_REPLY_TO;
    if (credit.reason === "credit_suspended")
      throw new DomainError("ORG_SUSPENDED", {
        detail: `New bookings are paused while invoices are overdue. Contact ${contact} to restore the account.`,
      });
    throw new DomainError("CREDIT_LIMIT_EXCEEDED", {
      detail: `Outstanding invoices of ${formatMoney(credit.outstanding, priced.detail.listing.currency)} plus this booking exceed the credit limit (${formatMoney(credit.check.remainingCents ?? 0, priced.detail.listing.currency)} remains). Contact ${contact} to raise it or settle an invoice.`,
    });
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
  // Service role: the database takes these totals and this deadline on trust, so only the server may submit
  // (migration 20261016120000_tenant_hardening). The acting user is passed in rather than read from the session.
  const { data, error } = await adminDb().rpc("submit_booking_request", {
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
    p_auth_user_id: claims.sub,
  });
  if (error) {
    // A concurrent duplicate may have landed first: hand back its result (§17.2).
    const domain = rpcErrorToDomain(error);
    if (
      submissionKey &&
      isDomainError(domain) &&
      (domain.code === "DATES_HELD" || domain.code === "DATES_UNAVAILABLE")
    ) {
      const dup = await existingBySubmissionKey(claims.org_id, submissionKey);
      if (dup) return dup;
    }
    throw domain;
  }
  const row = data?.[0];
  if (!row) throw new Error("submit_booking_request returned no row");

  const financeApproval = credit.outcome === "finance_approval";
  if (submissionKey || financeApproval) {
    const { error: uErr } = await adminDb()
      .from("booking_requests")
      .update({
        ...(submissionKey ? { submission_key: submissionKey } : {}),
        ...(financeApproval
          ? {
              finance_approval_required: true,
              finance_approval_reason:
                credit.reason === "credit_limit"
                  ? `Credit limit: outstanding ${formatMoney(credit.outstanding, priced.detail.listing.currency)} + this booking exceeds the limit`
                  : `Credit standing: ${credit.org.credit_standing}`,
            }
          : {}),
      })
      .eq("id", row.id);
    if (uErr)
      log.warn("booking.submit_post_update_failed", { requestId, reference: row.reference, error: uErr.message });
    if (financeApproval)
      await slack(
        "alerts",
        `:bank: ${row.reference} from ${credit.org.name} needs *finance approval* (${credit.reason === "credit_limit" ? "over the credit limit" : `credit standing ${credit.org.credit_standing}`}).`,
      );
  }

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
          propertyName: partnerPropertyName(listing.public_name, listing.internal_name),
          checkIn: formatDate(input.stay.checkIn),
          checkOut: formatDate(input.stay.checkOut),
          nights: q.nights,
          guestsSummary: guestsSummary(input.stay.adults, input.stay.children, input.stay.pets),
          totalFormatted: formatMoney(q.totalCents, listing.currency),
          claimRef: form.claimRef || undefined,
          poNumber: form.poNumber || undefined,
          submittedAtLabel: formatTimestamp(now.toISOString()),
          slaLabel: replyPromise(slaHours),
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
    financeApproval,
  };
}
