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
};

const EXTRA: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: "Please check the highlighted fields.",
  PRICE_CHANGED: "The price moved since you saw it. Review the new total and submit again.",
  DATES_HELD: "Another partner placed a hold on these dates seconds ago. Try different dates.",
  HOSTAWAY_UNAVAILABLE: "Live availability could not be checked. Try again in a minute; nothing was changed.",
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
