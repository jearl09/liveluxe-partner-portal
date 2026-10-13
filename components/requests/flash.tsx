import { Banner } from "@/components/ui/banner";
import { FLASH_KEYS, ScrubParams } from "@/components/ui/scrub-params";
import { ErrorCodes, type ErrorCode } from "@/lib/domain/errors";

const DONE: Record<string, string> = {
  "1": "Your request has been submitted. Live Luxe will review it and reply within the decision window.",
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

const EXTRA: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: "Please check the highlighted fields.",
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
}: {
  done?: string;
  error?: string;
  detail?: string;
  refCode?: string;
}) {
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
    return (
      <>
        <ScrubParams keys={FLASH_KEYS} />
        <Banner tone="error">
          <p>
            {ErrorCodes[code].message} {EXTRA[code] ?? ""}
          </p>
          {detail && <p className="text-xs">{detail}</p>}
          {refCode && <p className="font-mono text-xs">Ref {refCode}</p>}
        </Banner>
      </>
    );
  }
  return null;
}
