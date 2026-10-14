/**
 * The one sentence under every request's status (brief §2.3, §8.2, §13 rules 1–2):
 * what happens next and by when, in plain words, for the partner or for ops.
 * Pure: date formatting is injected so this stays free of Intl and is testable.
 */
import type { BookingStatus } from "./booking-state-machine";
import type { PaymentMode } from "./payments";

export type NextStepTone = "info" | "attention" | "success" | "muted" | "danger";

export interface NextStep {
  /** Short heading, e.g. "Live Luxe is reviewing". */
  title: string;
  /** One or two sentences: what happens next and by when. */
  body: string;
  tone: NextStepTone;
}

export interface NextStepInput {
  audience: "partner" | "ops";
  status: BookingStatus;
  now: Date;
  mode: PaymentMode;
  decisionDueAt: string | null;
  holdExpiresAt: string | null;
  slaPaused: boolean;
  checkIn: string;
  checkOut: string;
  /** Property-local check-in from / check-out by, e.g. "3:00 pm". */
  checkinFrom: string | null;
  checkoutBy: string | null;
  /** When the access pack releases (scheduled) and whether it already has. */
  checkinReleaseAt: string | null;
  checkinReleasedAt: string | null;
  balanceDueAt: string | null;
  balancePaidAt: string | null;
  declineReason: string | null;
  cancelledAt: string | null;
  refundCents: number | null;
  /** Card modes: the request has no card hold yet, so Live Luxe cannot approve it. */
  cardNeeded?: boolean;
  /** Formatters (injected). */
  when: (iso: string) => string;
  date: (isoDate: string) => string;
  money: (cents: number) => string;
  duration: (ms: number) => string;
}

export function nextStep(i: NextStepInput): NextStep {
  const ops = i.audience === "ops";
  const holdLeft = i.holdExpiresAt ? new Date(i.holdExpiresAt).getTime() - i.now.getTime() : null;
  const held = holdLeft !== null && holdLeft > 0;
  const arrive = `${i.date(i.checkIn)}${i.checkinFrom ? ` from ${i.checkinFrom}` : ""}`;
  const leave = `${i.date(i.checkOut)}${i.checkoutBy ? ` by ${i.checkoutBy}` : ""}`;

  switch (i.status) {
    case "DRAFT":
      return { title: "Not sent yet", body: "This request has not been submitted.", tone: "muted" };

    case "SUBMITTED":
    case "UNDER_REVIEW": {
      const due = i.decisionDueAt ? i.when(i.decisionDueAt) : null;
      if (i.cardNeeded)
        return ops
          ? {
              title: "Waiting for the partner's card hold",
              body: `You can't approve until their card is held.${due ? ` The decision is still due ${due}.` : ""}`,
              tone: "attention",
            }
          : {
              title: "One more step: hold your card",
              body: "Live Luxe can only approve once your card is held. Nothing is charged now; you pay only if the request is approved.",
              tone: "attention",
            };
      if (ops) {
        const overdue = i.decisionDueAt && new Date(i.decisionDueAt).getTime() < i.now.getTime();
        return {
          title: overdue ? "Decision overdue" : "Waiting on Live Luxe",
          body: due
            ? `${overdue ? "It was due" : "Decide by"} ${due}.${held ? ` The partner's dates are held for ${i.duration(holdLeft!)}.` : ""}`
            : "Decide as soon as you can.",
          tone: overdue ? "danger" : "info",
        };
      }
      return {
        title: "Live Luxe is reviewing your request",
        body: `${due ? `We'll reply by ${due}.` : "We'll reply within a few business hours."} The dates are held for you until then${
          i.mode === "invoice" ? "." : ", and nothing is charged unless we approve."
        }`,
        tone: "info",
      };
    }

    case "COUNTER_OFFERED":
      return ops
        ? {
            title: "Waiting on the partner",
            body: `They need to accept or decline the counter-offer${held ? ` within ${i.duration(holdLeft!)}` : ""}. The decision clock is paused.`,
            tone: "muted",
          }
        : {
            title: "Live Luxe suggested a change",
            body: `Please accept or decline${held && i.holdExpiresAt ? ` by ${i.when(i.holdExpiresAt)}` : ""}. The dates are held until then.`,
            tone: "attention",
          };

    case "APPROVED":
      return ops
        ? {
            title: "Confirming",
            body: "Writing the reservation to Hostaway and settling payment. This normally takes under a minute.",
            tone: "info",
          }
        : {
            title: "Approved — confirming now",
            body: `We're reserving the property${i.mode === "invoice" ? " and issuing your invoice" : " and finalising payment"}. This normally takes under a minute; you'll get an email.`,
            tone: "success",
          };

    case "AWAITING_PAYMENT":
      return ops
        ? {
            title: "Waiting for payment",
            body: `The partner has been asked to pay${held && i.holdExpiresAt ? `; the dates are held until ${i.when(i.holdExpiresAt)}` : ""}. It confirms by itself when the payment lands.`,
            tone: "attention",
          }
        : {
            title: "Approved — payment needed",
            body: `Pay to confirm the booking.${held ? ` The dates are held for ${i.duration(holdLeft!)}.` : ""}`,
            tone: "attention",
          };

    case "CONFIRMED": {
      const balance =
        i.balanceDueAt && !i.balancePaidAt ? ` The balance invoice is due ${i.date(i.balanceDueAt.slice(0, 10))}.` : "";
      if (i.checkinReleasedAt)
        return {
          title: ops ? "Confirmed · check-in pack released" : "Confirmed — check-in details are ready",
          body: `${ops ? "The partner can see the door code and Wi-Fi." : "The door code and Wi-Fi are below."} Check-in ${arrive}.${balance}`,
          tone: "success",
        };
      return {
        title: "Confirmed",
        body: `${
          i.checkinReleaseAt
            ? ops
              ? `The check-in pack releases ${i.when(i.checkinReleaseAt)}.`
              : `You'll get the door code and Wi-Fi ${i.when(i.checkinReleaseAt)}, by email and on this page.`
            : ""
        } Check-in ${arrive}.${balance}`.trim(),
        tone: "success",
      };
    }

    case "CHECKED_IN":
      return { title: "The guest is in", body: `Check-out ${leave}.`, tone: "success" };

    case "COMPLETED":
      return { title: "Stay finished", body: `Checked out ${i.date(i.checkOut)}.`, tone: "muted" };

    case "DECLINED":
      return {
        title: ops ? "Declined" : "Live Luxe couldn't take this request",
        body: `${i.declineReason ? `${i.declineReason}. ` : ""}The dates have been released${ops ? "." : " and nothing was charged. You can search again with the same dates."}`,
        tone: "muted",
      };

    case "EXPIRED":
      return {
        title: "Expired",
        body: ops
          ? "The hold lapsed before a decision or payment."
          : "The hold ran out before a decision or payment, so the dates were released. Nothing was charged.",
        tone: "muted",
      };

    case "CANCELLED":
      return {
        title: "Cancelled",
        body: `${i.cancelledAt ? `Cancelled ${i.when(i.cancelledAt)}. ` : ""}${
          i.refundCents && i.refundCents > 0
            ? `${i.money(i.refundCents)} ${ops ? "refunded" : "is refunded to the original card; it shows in 5–10 business days"}.`
            : "No refund was due."
        }`,
        tone: "muted",
      };

    case "FAILED":
      return ops
        ? {
            title: "Failed",
            body: "Payment capture or the Hostaway write failed after approval. Contact the partner and reconcile.",
            tone: "danger",
          }
        : {
            title: "We couldn't complete this booking",
            body: "The property could not be reserved after approval. Nothing has been charged; Live Luxe will contact you.",
            tone: "danger",
          };
  }
}
