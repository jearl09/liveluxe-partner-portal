import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DateField, DateRangeField } from "@/components/ui/date-field";
import { ConfirmDialog, Sheet, SheetForm } from "@/components/ui/dialog";
import { HelpTip } from "@/components/ui/help-tip";
import { PrintButton } from "@/components/ui/print-button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { BookingModificationRow, BookingRequestRow, InvoiceRow } from "@/lib/db/types";
import { DECLINE_REASON_CODES } from "@/lib/domain/booking-state-machine";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { CANCELLATION_REASON_LABELS, CANCELLATION_REASONS, type CancellationQuote } from "@/lib/domain/cancellation";
import { formatMoney } from "@/lib/domain/money";
import type { PaymentMode, PaymentState } from "@/lib/domain/payments";
import { DECLINE_REASON_LABELS } from "@/lib/domain/requests";
import { formatDate } from "@/lib/utils";

/*
 * The action panel (brief §8.3, §13 rule 1): only what this viewer can do now, as one
 * primary and a few secondary or destructive actions, each opening a form or a
 * confirmation that says exactly what will happen. Every action posts to the route
 * handler it always did; nothing here changes behaviour.
 */

export interface ActionInput {
  audience: "partner" | "ops";
  r: BookingRequestRow;
  orgName: string | null;
  createdByName: string | null;
  mode: PaymentMode;
  payState: PaymentState | null;
  invoice: InvoiceRow | null;
  gate: { ok: boolean; reason?: string };
  cancelQuote: CancellationQuote | null;
  cutoffDays: number;
  modifications: BookingModificationRow[];
  canReleaseNow: boolean;
  /** Counter-offer terms, for the accept confirmation. */
  counter: { newTotalCents: number | null; message: string | null } | null;
  can: {
    submit: boolean;
    cancel: boolean;
    approve: boolean;
    release: boolean;
    overrideRefund: boolean;
  };
  today: string;
}

export interface ActionSet {
  primary: ReactNode | null;
  secondary: ReactNode[];
  /** A sentence when there is nothing to do, or why the primary is unavailable. */
  note: ReactNode | null;
}

const label = "text-text-primary block text-body-sm font-semibold";
const req = (
  <span className="text-gold ml-0.5" aria-hidden>
    *
  </span>
);

function ReasonFields({ kind }: { kind: "cancel" | "decline" }) {
  return kind === "decline" ? (
    <>
      <label className={label}>
        Reason{req}
        <select name="reason" required aria-required className="mt-1 w-full" defaultValue="">
          <option value="" disabled>
            Choose a reason
          </option>
          {DECLINE_REASON_CODES.map((c) => (
            <option key={c} value={c}>
              {DECLINE_REASON_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Note to the partner
        <textarea
          name="notes"
          rows={2}
          maxLength={1000}
          className="mt-1 w-full"
          placeholder="Optional. Suggest alternatives if you can."
        />
      </label>
    </>
  ) : (
    <>
      <label className={label}>
        Reason
        <select name="reason" defaultValue="guest_no_longer_needs" className="mt-1 w-full">
          {CANCELLATION_REASONS.map((k) => (
            <option key={k} value={k}>
              {CANCELLATION_REASON_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Note (optional)
        <textarea name="notes" rows={2} maxLength={500} className="mt-1 w-full" />
      </label>
    </>
  );
}

function MoneyField({
  name,
  labelText,
  placeholder,
  hint,
}: {
  name: string;
  labelText: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className={label}>
      {labelText}
      <span className="border-strong-border bg-inset rounded-control focus-within:outline-focus mt-1 flex items-center border focus-within:outline-2 focus-within:outline-offset-2">
        <span className="text-text-muted text-body pl-3">AUD</span>
        <input
          name={name}
          inputMode="decimal"
          placeholder={placeholder}
          className="w-full border-0 bg-transparent text-right tabular-nums focus-visible:outline-none"
        />
      </span>
      {hint && <span className="text-text-muted text-body-sm mt-1 block font-normal">{hint}</span>}
    </label>
  );
}

type DecisionTarget = Pick<
  BookingRequestRow,
  "id" | "reference" | "total_cents" | "currency" | "check_in" | "check_out"
>;

/** Hidden fields that send a decision taken in the queue back to the queue. */
const back = (r: DecisionTarget, returnTo?: string): Record<string, string> =>
  returnTo ? { returnTo, ref: r.reference } : {};

/** Approve, with the consequences for this partner's payment mode (brief §6.3, §5.6). */
export function ApproveAction({
  r,
  mode,
  gate,
  notifies,
  className = "w-full",
  size,
  returnTo,
}: {
  r: DecisionTarget;
  mode: PaymentMode;
  gate: { ok: boolean; reason?: string };
  notifies: string;
  className?: string;
  size?: "sm" | "default";
  returnTo?: string;
}) {
  const money = (c: number) => formatMoney(c, r.currency);
  if (!gate.ok)
    return (
      <span className="block space-y-1">
        <Button variant="primary" size={size} className={className} disabled aria-describedby={`approve-why-${r.id}`}>
          Approve
        </Button>
        <span id={`approve-why-${r.id}`} className="text-text-muted text-body-sm block">
          {gate.reason}
        </span>
      </span>
    );
  return (
    <ConfirmDialog
      triggerLabel="Approve"
      triggerClassName={className}
      triggerSize={size}
      shortcut="a"
      title={`Approve ${r.reference}?`}
      consequences={[
        "Re-check availability and create the reservation in Hostaway",
        mode === "invoice"
          ? `Issue a tax invoice for ${money(r.total_cents ?? 0)} on the partner's terms`
          : mode === "deposit"
            ? "Charge the deposit to the card on hold and schedule the balance invoice"
            : `Charge ${money(r.total_cents ?? 0)} to the card on hold`,
        "Confirm the booking",
      ]}
      notifies={notifies}
      confirmLabel="Approve and confirm"
      action={`/api/admin/requests/${r.id}`}
      hidden={{ action: "approve", ...back(r, returnTo) }}
    />
  );
}

/** Counter-offer in a Sheet: new total and/or dates, and a message (brief §6.3). */
export function CounterAction({
  r,
  today,
  className = "w-full",
  size,
  returnTo,
}: {
  r: DecisionTarget;
  today: string;
  className?: string;
  size?: "sm" | "default";
  returnTo?: string;
}) {
  const money = (c: number) => formatMoney(c, r.currency);
  return (
    <Sheet
      title="Counter-offer"
      description="Propose a different price or dates. The decision clock pauses until the partner answers."
      trigger={
        <Button variant="secondary" size={size} className={className} data-shortcut="c" aria-keyshortcuts="c">
          Counter-offer
        </Button>
      }
    >
      <SheetForm
        action={`/api/admin/requests/${r.id}`}
        hidden={{ action: "counter", ...back(r, returnTo) }}
        submit={<SubmitButton pendingLabel="Sending…">Send counter-offer</SubmitButton>}
      >
        <p className="text-text-secondary">
          Now: {formatDate(r.check_in)} → {formatDate(r.check_out)} · {money(r.total_cents ?? 0)}. Change either or
          both.
        </p>
        <MoneyField
          name="newTotal"
          labelText="New total, including GST"
          placeholder={r.total_cents != null ? (r.total_cents / 100).toFixed(2) : ""}
          hint="Leave empty to keep the current total."
        />
        <DateRangeField
          label="Dates"
          nameFrom="newCheckIn"
          nameTo="newCheckOut"
          defaultFrom={r.check_in}
          defaultTo={r.check_out}
          min={today}
          hint="Leave as they are to keep the current dates."
        />
        <label className={label}>
          Message to the partner{req}
          <textarea
            name="message"
            rows={3}
            required
            aria-required
            maxLength={1000}
            className="mt-1 w-full"
            placeholder="Why you are proposing this, in a sentence or two"
          />
        </label>
      </SheetForm>
    </Sheet>
  );
}

/** Decline with a structured reason (brief §6.3). */
export function DeclineAction({
  r,
  notifies,
  className = "w-full",
  size,
  returnTo,
}: {
  r: DecisionTarget;
  notifies: string;
  className?: string;
  size?: "sm" | "default";
  returnTo?: string;
}) {
  return (
    <ConfirmDialog
      triggerLabel="Decline"
      triggerClassName={className}
      triggerSize={size}
      tone="destructive"
      shortcut="d"
      title={`Decline ${r.reference}?`}
      consequences={["Release the dates and any card hold", "Email the partner the reason below"]}
      notifies={notifies}
      confirmLabel="Decline request"
      action={`/api/admin/requests/${r.id}`}
      hidden={{ action: "decline", ...back(r, returnTo) }}
    >
      <ReasonFields kind="decline" />
    </ConfirmDialog>
  );
}

/** Take ownership of a submitted request. */
export function AssignAction({
  id,
  className = "w-full",
  size,
  returnTo,
  reference,
}: {
  id: string;
  className?: string;
  size?: "sm" | "default";
  returnTo?: string;
  reference?: string;
}) {
  return (
    <form method="post" action={`/api/admin/requests/${id}`}>
      <input type="hidden" name="action" value="review" />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {returnTo && reference && <input type="hidden" name="ref" value={reference} />}
      <SubmitButton variant="tertiary" size={size} className={className} pendingLabel="Assigning…">
        Assign to me
      </SubmitButton>
    </form>
  );
}

export function buildActions(i: ActionInput): ActionSet {
  const { r } = i;
  const money = (c: number) => formatMoney(c, r.currency);
  const stay = `${formatDate(r.check_in)} → ${formatDate(r.check_out)}`;
  const partnerRoute = `/api/requests/${r.id}`;
  const opsRoute = `/api/admin/requests/${r.id}`;
  const q = i.cancelQuote;
  const pending = i.modifications.filter((m) => m.status === "requested");
  const secondary: ReactNode[] = [];
  let primary: ReactNode | null = null;
  let note: ReactNode | null = null;

  // ------------------------------------------------------------------ partner
  if (i.audience === "partner") {
    const s = r.status;

    if (s === "COUNTER_OFFERED" && i.can.submit) {
      primary = (
        <ConfirmDialog
          key="accept"
          triggerLabel="Accept counter-offer"
          triggerClassName="w-full"
          title="Accept Live Luxe's proposal?"
          consequences={[
            `Keep the request on these terms: ${stay}${i.counter?.newTotalCents != null ? `, ${money(i.counter.newTotalCents)}` : ""}`,
            "Send it back to Live Luxe to confirm",
          ]}
          confirmLabel="Accept counter-offer"
          action={`${partnerRoute}/counter`}
          hidden={{ action: "accept" }}
        />
      );
      secondary.push(
        <ConfirmDialog
          key="decline-counter"
          triggerLabel="Decline counter-offer"
          triggerClassName="w-full"
          tone="destructive"
          title="Decline the proposal?"
          consequences={["Close this request", "Release the dates", "Release any card hold — nothing is charged"]}
          confirmLabel="Decline and close"
          action={`${partnerRoute}/counter`}
          hidden={{ action: "decline" }}
        />,
      );
    }

    // Pay: card modes need a hold before review and a payment when approved-but-unpaid.
    const cardMode = i.mode !== "invoice";
    const needsCard = cardMode && i.payState !== "authorised" && i.payState !== "captured";
    if (i.can.submit && needsCard && (s === "SUBMITTED" || s === "UNDER_REVIEW" || s === "AWAITING_PAYMENT")) {
      primary = (
        <Button key="pay" asChild variant="primary" className="w-full">
          <Link href={`/requests/${r.id}/pay`}>
            {s === "AWAITING_PAYMENT"
              ? "Pay now"
              : i.payState === "failed" || i.payState === "requires_action"
                ? "Try another card"
                : "Secure with a card hold"}
          </Link>
        </Button>
      );
    }
    if (s === "AWAITING_PAYMENT" && !cardMode && i.invoice?.hosted_url && i.invoice.status !== "paid") {
      primary = (
        <Button key="pay-invoice" asChild variant="primary" className="w-full">
          <a href={i.invoice.hosted_url} target="_blank" rel="noreferrer">
            Pay invoice
          </a>
        </Button>
      );
    }

    // Changes to a confirmed stay.
    if ((s === "CONFIRMED" || s === "CHECKED_IN") && i.can.submit) {
      if (pending.length > 0) {
        note = `You asked for ${pending[0].kind === "extension" ? "an extension" : "an early departure"} on ${formatDate(pending[0].requested_at.slice(0, 10))}. Live Luxe will reply by email.`;
      } else {
        const daysToCheckout = daysBetween(i.today, r.check_out);
        const extend = (
          <Sheet
            key="extend"
            title="Extend the stay"
            description="We quote only the extra nights and check they are free. Live Luxe confirms by email."
            trigger={
              <Button variant={daysToCheckout <= 14 ? "primary" : "secondary"} className="w-full">
                Extend the stay
              </Button>
            }
          >
            <SheetForm
              action={`${partnerRoute}/modify`}
              hidden={{ action: "extend" }}
              submit={<SubmitButton pendingLabel="Checking the dates…">Check and request</SubmitButton>}
            >
              <p className="text-text-secondary">Current check-out: {formatDate(r.check_out)}.</p>
              <DateField
                label="New check-out"
                name="newCheckOut"
                required
                min={addDays(r.check_out, 1)}
                defaultValue={addDays(r.check_out, 7)}
              />
              <label className={label}>
                Reason (optional)
                <textarea
                  name="reason"
                  rows={2}
                  maxLength={500}
                  className="mt-1 w-full"
                  placeholder="For example: the rebuild is running late"
                />
              </label>
              <p className="text-text-muted text-body-sm">
                If the property is booked for those nights, we show the nearest alternatives instead.
              </p>
            </SheetForm>
          </Sheet>
        );
        if (daysToCheckout <= 14) primary = extend;
        else secondary.push(extend);
        secondary.push(
          <Sheet
            key="early"
            title="Leave early"
            description="Tell us the new check-out. The unused nights are refunded under the cancellation policy once Live Luxe approves."
            trigger={
              <Button variant="secondary" className="w-full">
                Leave early
              </Button>
            }
          >
            <SheetForm
              action={`${partnerRoute}/modify`}
              hidden={{ action: "early_departure" }}
              submit={<SubmitButton pendingLabel="Sending…">Request early departure</SubmitButton>}
            >
              <p className="text-text-secondary">Current check-out: {formatDate(r.check_out)}.</p>
              <DateField
                label="New check-out"
                name="newCheckOut"
                required
                min={addDays(r.check_in, 1)}
                max={addDays(r.check_out, -1)}
              />
              <label className={label}>
                Reason (optional)
                <textarea name="reason" rows={2} maxLength={500} className="mt-1 w-full" />
              </label>
            </SheetForm>
          </Sheet>,
        );
      }
    }

    // Withdraw / cancel / ask to cancel.
    if (i.can.cancel && q) {
      if (q.kind === "withdraw") {
        secondary.push(
          <ConfirmDialog
            key="withdraw"
            triggerLabel="Withdraw request"
            triggerClassName="w-full"
            tone="destructive"
            title={`Withdraw ${r.reference}?`}
            consequences={[
              "Close this request and release the dates",
              ...(i.mode !== "invoice" ? ["Release the card hold — nothing is charged"] : []),
              "Let Live Luxe know",
            ]}
            confirmLabel="Withdraw request"
            action={`${partnerRoute}/cancel`}
            hidden={{ action: "cancel" }}
          >
            <ReasonFields kind="cancel" />
          </ConfirmDialog>,
        );
      } else if (r.cancellation_requested_at) {
        note = note ?? "You asked to cancel. Live Luxe will reply by email.";
      } else if (q.selfService) {
        secondary.push(
          <ConfirmDialog
            key="cancel"
            triggerLabel="Cancel booking"
            triggerClassName="w-full"
            tone="destructive"
            title={`Cancel ${r.reference}?`}
            consequences={[
              "Cancel the booking and release the dates",
              q.capturedCents > 0
                ? `Refund ${money(q.refundCents)} to the original card (5–10 business days)`
                : "Credit or void the invoice",
              ...(q.retainedCents > 0 ? [`Keep ${money(q.retainedCents)} under the cancellation policy`] : []),
              "Email you a confirmation",
            ]}
            confirmLabel="Cancel booking"
            action={`${partnerRoute}/cancel`}
            hidden={{ action: "cancel" }}
          >
            <ReasonFields kind="cancel" />
          </ConfirmDialog>,
        );
      } else {
        secondary.push(
          <ConfirmDialog
            key="ask-cancel"
            triggerLabel="Ask to cancel"
            triggerVariant="secondary"
            triggerClassName="w-full"
            title="Ask Live Luxe to cancel?"
            consequences={[
              `It is ${q.daysUntilCheckIn} days to check-in, inside the ${i.cutoffDays}-day cut-off, so Live Luxe decides`,
              `Under the policy ${q.retainPct}% (${money(q.retainedCents)}) would be kept`,
              "Live Luxe replies by email",
            ]}
            confirmLabel="Send cancellation request"
            action={`${partnerRoute}/cancel`}
            hidden={{ action: "request_cancel" }}
          >
            <ReasonFields kind="cancel" />
          </ConfirmDialog>,
        );
      }
    }

    // Ended: one way forward.
    if (["DECLINED", "EXPIRED", "CANCELLED", "COMPLETED", "FAILED"].includes(s)) {
      const future = r.check_in > i.today;
      primary = (
        <Button key="again" asChild variant="primary" className="w-full">
          <Link
            href={
              future
                ? `/search?checkIn=${r.check_in}&checkOut=${r.check_out}&guests=${r.guests_adults + r.guests_children}&pets=${r.guests_pets}`
                : "/search"
            }
          >
            {future ? "Search these dates again" : "Find a property"}
          </Link>
        </Button>
      );
    }

    if (!primary && secondary.length === 0 && !note) {
      note =
        s === "APPROVED"
          ? "Nothing to do — we'll email you when it's confirmed."
          : s === "SUBMITTED" || s === "UNDER_REVIEW"
            ? "Nothing to do now. We'll email you when Live Luxe decides."
            : "Nothing needs doing right now.";
    }
  }

  // ------------------------------------------------------------------ ops
  if (i.audience === "ops") {
    const s = r.status;
    const who = `${i.createdByName ?? "The partner"}${i.orgName ? ` (${i.orgName})` : ""} is emailed.`;

    if ((s === "SUBMITTED" || s === "UNDER_REVIEW") && i.can.approve) {
      primary = <ApproveAction key="approve" r={r} mode={i.mode} gate={i.gate} notifies={who} />;
      secondary.push(
        <CounterAction key="counter" r={r} today={i.today} />,
        <DeclineAction key="decline" r={r} notifies={who} />,
      );
      if (s === "SUBMITTED") secondary.push(<AssignAction key="review" id={r.id} />);
    }

    if ((s === "CONFIRMED" || s === "CHECKED_IN") && i.can.approve) {
      for (const m of pending) {
        const ext = m.kind === "extension";
        const amount = money(Math.abs(m.delta_cents));
        const approve = (
          <ConfirmDialog
            key={`mod-approve-${m.id}`}
            triggerLabel={`Approve ${ext ? "extension" : "early departure"}`}
            triggerClassName="w-full"
            title={`Approve the ${ext ? "extension" : "early departure"} to ${formatDate(m.new_check_out)}?`}
            consequences={
              ext
                ? [
                    "Re-check the extra nights in Hostaway and extend the reservation",
                    m.delta_cents > 0 ? `Charge or invoice ${amount} for the extra nights` : "No extra charge",
                  ]
                : [
                    "Shorten the reservation in Hostaway",
                    m.delta_cents !== 0
                      ? `Refund ${amount} under the cancellation policy`
                      : "No refund is due under the policy",
                  ]
            }
            notifies={who}
            confirmLabel="Approve"
            action={opsRoute}
            hidden={{ action: "modification_approve", modificationId: m.id }}
          >
            {!ext && i.can.overrideRefund && (
              <MoneyField
                name="refundAmount"
                labelText="Refund amount"
                placeholder={(Math.abs(m.delta_cents) / 100).toFixed(2)}
                hint="Leave empty to apply the policy. A note is required if you change it."
              />
            )}
            <label className={label}>
              Note to the partner
              <textarea name="notes" rows={2} maxLength={500} className="mt-1 w-full" />
            </label>
          </ConfirmDialog>
        );
        if (!primary) primary = approve;
        else secondary.push(approve);
        secondary.push(
          <ConfirmDialog
            key={`mod-decline-${m.id}`}
            triggerLabel={`Decline ${ext ? "extension" : "early departure"}`}
            triggerClassName="w-full"
            tone="destructive"
            title="Decline this change?"
            consequences={["Keep the booking as it is", "Email the partner"]}
            confirmLabel="Decline change"
            action={opsRoute}
            hidden={{ action: "modification_decline", modificationId: m.id }}
          >
            <label className={label}>
              Note to the partner
              <textarea name="notes" rows={2} maxLength={500} className="mt-1 w-full" />
            </label>
          </ConfirmDialog>,
        );
      }
      if (i.can.release && i.canReleaseNow)
        secondary.push(
          <ConfirmDialog
            key="release"
            triggerLabel="Release check-in pack now"
            triggerVariant="secondary"
            triggerClassName="w-full"
            title="Release the check-in pack early?"
            consequences={["Show the door code and Wi-Fi to the partner now", "Email them that the details are ready"]}
            confirmLabel="Release now"
            action={opsRoute}
            hidden={{ action: "release_checkin" }}
          />,
        );
    }

    if (i.can.cancel && q && q.kind === "cancel") {
      secondary.push(
        <ConfirmDialog
          key="ops-cancel"
          triggerLabel="Cancel booking"
          triggerClassName="w-full"
          tone="destructive"
          title={`Cancel ${r.reference}?`}
          consequences={[
            "Cancel the reservation in Hostaway and release the dates",
            q.capturedCents > 0
              ? `Refund ${money(q.refundCents)} under the policy (${q.retainPct}% kept, ${q.daysUntilCheckIn} days to check-in)`
              : "Credit or void the invoice under the policy",
            "Email the partner",
          ]}
          confirmLabel="Cancel booking"
          action={opsRoute}
          hidden={{ action: "cancel" }}
        >
          <ReasonFields kind="cancel" />
          {i.can.overrideRefund && q.capturedCents > 0 && (
            <MoneyField
              name="refundAmount"
              labelText="Refund amount"
              placeholder={(q.refundCents / 100).toFixed(2)}
              hint={`Leave empty to apply the policy. At most ${money(q.capturedCents)}.`}
            />
          )}
        </ConfirmDialog>,
      );
    }

    if (!primary && secondary.length === 0) {
      note =
        s === "COUNTER_OFFERED"
          ? "Waiting for the partner to answer."
          : s === "APPROVED"
            ? "Confirming — nothing to do unless it stalls."
            : s === "AWAITING_PAYMENT"
              ? "Waiting for the partner to pay."
              : "No further action on this booking.";
    }
  }

  return { primary, secondary, note };
}

/** The panel itself: heading, the actions, then Print as a quiet last line. */
export function ActionPanel({ set, audience }: { set: ActionSet; audience: "partner" | "ops" }) {
  return (
    <section
      aria-labelledby="actions-heading"
      className="bg-surface border-subtle rounded-card border p-5 print:hidden"
    >
      <h2 id="actions-heading" className="flex items-center gap-1">
        {audience === "partner" ? "What you can do" : "Actions"}
        {audience === "partner" && (
          <HelpTip label="What is a counter-offer?">
            If Live Luxe can&apos;t do exactly what you asked, they may suggest other dates, another property or a
            different price. You accept or decline it here.
          </HelpTip>
        )}
      </h2>
      <div className="mt-3 space-y-2">
        {set.primary}
        {set.secondary}
        {set.note && <p className="text-text-secondary">{set.note}</p>}
      </div>
      <div className="border-subtle mt-4 border-t pt-3">
        <PrintButton variant="tertiary" size="default" />
      </div>
    </section>
  );
}
