import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { Panel, PanelHeading, PanelSection } from "@/components/ui/panel";
import { DECLINE_REASON_CODES } from "@/lib/domain/booking-state-machine";
import { DECLINE_REASON_LABELS } from "@/lib/domain/requests";
import type { BookingRequestRow } from "@/lib/db/types";

/**
 * Ops actions for one request (§13.4). Three plain forms posting to the same route;
 * the server validates the transition, so a stale page cannot do the wrong thing.
 *
 * One panel, not three: approving is the expected outcome and gets the primary button;
 * the two alternatives sit beneath it as disclosures, so the eye lands on the decision
 * and not on a stack of equal cards. Declining asks for a second press — it notifies the
 * partner and releases the hold.
 */
export function DecisionPanel({ request: r, today }: { request: BookingRequestRow; today: string }) {
  const action = `/api/admin/requests/${r.id}`;
  const decidable = r.status === "SUBMITTED" || r.status === "UNDER_REVIEW";

  if (!decidable) {
    return (
      <Panel aria-labelledby="decision-heading">
        <PanelHeading id="decision-heading" title="Decision" className="mb-2" />
        <p className="text-foreground text-sm">
          {r.status === "COUNTER_OFFERED"
            ? "Waiting for the partner to answer the counter-offer. The SLA clock is paused."
            : r.status === "APPROVED"
              ? "Approved. Payment capture and the Hostaway reservation follow in the confirmation step."
              : "No further decision is possible in this state."}
        </p>
      </Panel>
    );
  }

  return (
    <Panel flush className="divide-border divide-y" aria-labelledby="decision-heading">
      <PanelSection>
        <PanelHeading id="decision-heading" title="Decision" className="mb-3" />
        <form method="post" action={action}>
          <input type="hidden" name="action" value="approve" />
          <Button type="submit" variant="gold" className="w-full">
            Approve request
          </Button>
        </form>
        <p className="text-muted-foreground mt-2.5 text-xs">
          Re-checks live availability in Hostaway, then reserves the dates for this partner.
        </p>
      </PanelSection>

      <Disclosure title="Counter-offer" hint="Change the price or the dates. The partner answers within the hold.">
        <form method="post" action={action} className="space-y-3">
          <input type="hidden" name="action" value="counter" />
          <label className={labelClass}>
            New total (AUD, incl. GST)
            <input
              name="newTotal"
              inputMode="decimal"
              placeholder={r.total_cents != null ? (r.total_cents / 100).toFixed(2) : ""}
              className={`${fieldClass} mt-1`}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              New check-in
              <input name="newCheckIn" type="date" min={today} className={`${fieldClass} mt-1`} />
            </label>
            <label className={labelClass}>
              New check-out
              <input name="newCheckOut" type="date" min={today} className={`${fieldClass} mt-1`} />
            </label>
          </div>
          <label className={labelClass}>
            Message to the partner <span className="text-accent">*</span>
            <textarea name="message" rows={3} required maxLength={1000} className={`${fieldClass} mt-1`} />
          </label>
          <p className="text-muted-foreground text-xs">Leave a field blank to keep it as it is.</p>
          <Button type="submit" variant="outline" className="w-full">
            Send counter-offer
          </Button>
        </form>
      </Disclosure>

      <Disclosure title="Decline" hint="Notifies the partner and releases the dates.">
        <form method="post" action={action} className="space-y-3">
          <input type="hidden" name="action" value="decline" />
          <label className={labelClass}>
            Reason <span className="text-accent">*</span>
            <select name="reason" required className={`${fieldClass} mt-1`} defaultValue="">
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
          <label className={labelClass}>
            Note to the partner
            <textarea
              name="notes"
              rows={2}
              maxLength={1000}
              className={`${fieldClass} mt-1`}
              placeholder="Optional. Suggest alternatives if you can."
            />
          </label>
          <ConfirmButton variant="destructive" size="default" confirmLabel="Confirm decline" className="w-full">
            Decline request
          </ConfirmButton>
        </form>
      </Disclosure>
    </Panel>
  );
}

/** A secondary action folded away under a row that reads like a list item, not a card. */
function Disclosure({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="hover:bg-muted/60 focus-visible:ring-ring flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="text-strong block text-sm font-medium">{title}</span>
          <span className="text-muted-foreground block text-xs">{hint}</span>
        </span>
        <ChevronDown
          className="text-muted-foreground ease-ios h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
