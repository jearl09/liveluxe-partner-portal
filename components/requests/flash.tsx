import { Banner } from "@/components/ui/banner";
import { Toast } from "@/components/ui/toast";
import { FLASH_KEYS, ScrubParams } from "@/components/ui/scrub-params";
import { ErrorCodes, type ErrorCode } from "@/lib/domain/errors";

const DONE: Record<string, string> = {
  "1": "Request sent. Live Luxe will reply by the time shown below, usually faster in business hours. We've emailed you a copy.",
  review: "Review started. This request is now assigned to you.",
  approved: "Approved. The dates are now reserved for this partner.",
  declined: "Declined. The partner has been notified and the hold released.",
  countered: "Counter-offer sent. The SLA clock is paused until the partner answers.",
  counter_accepted: "You accepted the counter-offer. Live Luxe will confirm shortly.",
  counter_declined: "You declined the counter-offer. The request is closed and the dates released.",
  rate_card_published: "New rate card published. Quotes from its start date use it.",
  partner_created: "Partner organisation created. Invite their first administrator below.",
  partner_updated: "Partner settings saved.",
  invited: "Invitation sent. It is valid for 7 days.",
  invited_nomail:
    "Invitation created, but email is not configured on this environment yet. Copy the link below and send it yourself; it is shown once.",
  invitation_revoked: "Invitation revoked. The link no longer works.",
  user_disabled: "Access removed. They can no longer sign in.",
  user_enabled: "Access restored.",
  card_held: "Card hold placed. Live Luxe will review the request; nothing is charged until approval.",
  paid: "Payment received. Thank you.",
  payment_pending: "Your payment is processing. This page updates once the bank confirms.",
  confirmed: "Confirmed. Payment is captured, the invoice is issued and the booking is locked in.",
  cancelled: "Cancelled. The dates are released and any refund is on its way; the partner has been emailed.",
  cancelled_refund_pending:
    "Cancelled and the dates released, but the Stripe refund did not go through. Finance has been alerted to process it by hand.",
  withdrawn: "Request withdrawn. The dates and the card hold are released.",
  cancellation_requested:
    "Cancellation request sent. Live Luxe will review it against the policy and email you the outcome.",
  approved_payment_pending:
    "Approved, but the card could not be charged. The partner has been emailed a payment link; the booking confirms automatically once they pay.",
  approved_hostaway_pending:
    "Approved and the card is held. The Hostaway reservation could not be written just now; it is retried every minute and ops are alerted if it is still open after five.",
  finance_review:
    "Your request has been submitted. Because of your organisation's credit position it will be reviewed by Live Luxe finance before it is approved.",
  extension_requested:
    "Extension requested. Live Luxe will check the extra nights and email you the decision and the supplementary invoice.",
  early_departure_requested:
    "Early departure requested. Live Luxe will confirm the refund under the cancellation policy and email you.",
  modification_approved:
    "Approved. The booking dates are updated, Hostaway is in step and the partner has been emailed.",
  modification_declined: "Declined. The booking is unchanged and the partner has been emailed.",
  checkin_released: "Check-in details released to the partner now; the release is logged.",
};

/**
 * Brief §9.2: the wording a partner sees for the request-flow codes, in their terms and never
 * naming internals (a price-hash mismatch is "needs refreshing", never tampering). Replaces the
 * API message; the next step follows in EXTRA.
 */
const PARTNER_WORDS: Partial<Record<ErrorCode, string>> = {
  DATES_UNAVAILABLE: "These dates are no longer available for this property.",
  DATES_HELD: "Another partner holds these dates while Live Luxe reviews their request.",
  QUOTE_EXPIRED: "This price has expired.",
  PRICE_CHANGED: "The price has changed since you priced this stay.",
  PAYMENT_REQUIRES_ACTION: "Your bank asked for extra verification and it was not completed.",
  PRICE_HASH_MISMATCH: "This quote needs refreshing.",
  MIN_STAY_NOT_MET: "This property needs a longer stay for these dates.",
  CAPACITY_EXCEEDED: "This property does not sleep that many guests or pets.",
  CREDIT_LIMIT_EXCEEDED: "This request would take your organisation past its credit limit.",
  ORG_SUSPENDED:
    "New requests are paused for your organisation. Existing bookings, invoices and check-in details are unaffected.",
};

const PARTNER_EXTRA: Partial<Record<ErrorCode, string>> = {
  DATES_UNAVAILABLE: "Pick other dates on the property's calendar, or see what else is free.",
  DATES_HELD: "Pick other dates, or see what else is free for these dates.",
  QUOTE_EXPIRED: "Price the stay again to continue; nothing has been sent.",
  PRICE_CHANGED: "Review the new total and submit again; nothing has been sent.",
  PAYMENT_REQUIRES_ACTION: "Place the card hold again; nothing has been charged.",
  PRICE_HASH_MISMATCH: "Price the stay again to continue; nothing has been sent.",
  MIN_STAY_NOT_MET: "The property page shows the minimum and can extend the stay for you.",
  CAPACITY_EXCEEDED: "Search shows properties that fit.",
  CREDIT_LIMIT_EXCEEDED:
    "Nothing has been sent. Your finance contact can settle an invoice or ask Live Luxe to raise it.",
};

/** Next steps written for Live Luxe staff; partners never see these. */
const OPS_ONLY: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "PAYMENT_NOT_AUTHORISED",
  "CREDIT_LIMIT_EXCEEDED",
  "FINANCE_APPROVAL_REQUIRED",
  "APPROVAL_VALUE_CEILING",
  "REFUND_EXCEEDS_CAPTURED",
  "REFUNDS_FROZEN",
  "APPROVAL_BLOCKED_CONFIG",
]);

const EXTRA: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: "Please check the highlighted fields.",
  APPROVAL_BLOCKED_CONFIG:
    "Turn on Hostaway writes for production in Vercel (HOSTAWAY_ALLOW_WRITES=true), or go back to Stripe test keys, then redeploy.",
  PRICE_CHANGED: "The price moved since you saw it. Review the new total and submit again.",
  DATES_HELD: "Another partner placed a hold on these dates seconds ago. Try different dates.",
  HOSTAWAY_UNAVAILABLE: "Live availability could not be checked. Try again in a minute; nothing was changed.",
  PAYMENT_NOT_AUTHORISED: "Ask the partner to place a card hold from their request page, then approve.",
  CREDIT_LIMIT_EXCEEDED: "Raise the credit limit on the partner's page, or decline.",
  PAYMENT_FAILED: "Please try another card.",
  PAYMENT_REQUIRES_ACTION: "Your bank asked for extra authentication and it was not completed. Please try again.",
  PAYMENT_PROVIDER_UNAVAILABLE: "Nothing has been lost: the dates are held and the request is saved.",
  FINANCE_APPROVAL_REQUIRED: "A Live Luxe finance user must approve this one.",
  APPROVAL_VALUE_CEILING: "Ask finance to approve it.",
  REFUND_EXCEEDS_CAPTURED: "Enter an amount up to the maximum shown.",
  REFUNDS_FROZEN: "Resolve the dispute in Stripe first; the freeze lifts when it closes.",
  EXTENSION_UNAVAILABLE: "The alternatives listed on the booking are available for those nights.",
  INVALID_MODIFICATION: "",
};

/**
 * One-line outcome banner driven by ?submitted= / ?done= / ?error= query params. The
 * params are scrubbed from the address bar once shown, so a refresh does not replay them.
 */
export function Flash({
  done,
  error,
  detail,
  refCode,
  toast = false,
  subject,
  audience = "partner",
}: {
  done?: string;
  error?: string;
  detail?: string;
  refCode?: string;
  /** Confirm a success as a toast (brief §4.8) rather than a banner. Errors always stay inline. */
  toast?: boolean;
  /** Names what the toast is about ("LLX-2026-000412"), for a confirmation shown away from the record. */
  subject?: string;
  /** Who is reading: partners get §9.2 wording and never an ops instruction. */
  audience?: "partner" | "ops";
}) {
  if (done && DONE[done] && toast) {
    const [title, ...rest] = DONE[done].split(/(?<=\.)\s/);
    return (
      <>
        <ScrubParams keys={FLASH_KEYS} />
        <Toast
          title={subject ? `${subject}: ${title}` : title}
          body={[...rest, detail].filter(Boolean).join(" ") || undefined}
        />
      </>
    );
  }
  if (done && DONE[done]) {
    return (
      <>
        <ScrubParams keys={FLASH_KEYS} />
        <Banner tone="success">{DONE[done]}</Banner>
      </>
    );
  }
  if (error) {
    const code = (error in ErrorCodes ? error : "INTERNAL") as ErrorCode;
    const partner = audience === "partner";
    const words = (partner && PARTNER_WORDS[code]) || ErrorCodes[code].message;
    const next = partner ? (PARTNER_EXTRA[code] ?? (OPS_ONLY.has(code) ? "" : EXTRA[code])) : EXTRA[code];
    return (
      <>
        <ScrubParams keys={FLASH_KEYS} />
        <Banner tone="error">
          <p>
            {words} {next ?? ""}
          </p>
          {detail && <p className="text-xs">{detail}</p>}
          {refCode && <p className="font-mono text-xs">Ref {refCode}</p>}
        </Banner>
      </>
    );
  }
  return null;
}
