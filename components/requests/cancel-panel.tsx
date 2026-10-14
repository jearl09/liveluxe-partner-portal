import { ChevronDown } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fieldClasses, labelClass } from "@/components/ui/field";
import { Panel, PanelHeading } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import type { BookingRequestRow } from "@/lib/db/types";
import { CANCELLATION_REASON_LABELS, CANCELLATION_REASONS, type CancellationQuote } from "@/lib/domain/cancellation";
import { formatMoney } from "@/lib/domain/money";
import { formatTimestamp } from "@/lib/utils";

export interface CancelPanelProps {
  audience: "partner" | "ops";
  request: BookingRequestRow;
  quote: CancellationQuote | null;
  cutoffDays: number;
  /** Ops only: may type a different refund amount (livluxe_finance / livluxe_admin). */
  canOverrideRefund?: boolean;
}

/**
 * Withdraw / cancel / request cancellation (§10.3). One plain form posting to the
 * cancel route; the server recomputes the policy so a stale page cannot refund
 * more than it should. Collapsed by default: cancelling is the exception.
 */
export function CancelPanel(p: CancelPanelProps) {
  const r = p.request;
  const q = p.quote;
  if (!q) return null;
  const action = p.audience === "partner" ? `/api/requests/${r.id}/cancel` : `/api/admin/requests/${r.id}`;
  const money = (c: number) => formatMoney(c, r.currency);
  const partnerMustAsk = p.audience === "partner" && !q.selfService;
  const verb = q.kind === "withdraw" ? "Withdraw request" : partnerMustAsk ? "Request cancellation" : "Cancel booking";
  const requested = !!r.cancellation_requested_at;

  return (
    <Panel aria-labelledby="cancel-heading" className="print:hidden">
      <PanelHeading id="cancel-heading" title={q.kind === "withdraw" ? "Withdraw" : "Cancellation"} className="mb-2" />

      {requested && (
        <p className="mb-3 rounded-md border border-attention-border bg-attention-bg px-3 py-2 text-xs text-attention-fg">
          Cancellation requested {formatTimestamp(r.cancellation_requested_at!)}
          {r.cancellation_reason && ` — ${r.cancellation_reason}`}.{" "}
          {p.audience === "partner" ? "Live Luxe will decide and you will be emailed." : "Decide below."}
        </p>
      )}

      <dl className="text-foreground mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {q.kind === "cancel" && (
          <>
            <dt className="text-muted-foreground">Days to check-in</dt>
            <dd>
              {q.daysUntilCheckIn} <span className="text-muted-foreground text-xs">(cut-off {p.cutoffDays} days)</span>
            </dd>
            <dt className="text-muted-foreground">Policy retains</dt>
            <dd>
              {q.retainPct}% · {money(q.retainedCents)}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Refund</dt>
        <dd>
          {q.capturedCents > 0
            ? money(q.refundCents)
            : q.kind === "withdraw"
              ? "Nothing charged; the card hold is released."
              : "No card payment to refund."}
        </dd>
      </dl>

      <details className="group">
        <summary className="text-foreground flex cursor-pointer list-none items-center gap-1 text-sm font-medium">
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          {verb}
        </summary>
        <form method="post" action={action} className="mt-3 space-y-3">
          <input type="hidden" name="action" value={partnerMustAsk ? "request_cancel" : "cancel"} />
          <label className={labelClass}>
            Reason
            <select name="reason" defaultValue="other" className={fieldClasses(false, "mt-1")}>
              {CANCELLATION_REASONS.map((k) => (
                <option key={k} value={k}>
                  {CANCELLATION_REASON_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Note (optional)
            <textarea name="notes" rows={2} maxLength={500} className={fieldClasses(false, "mt-1")} />
          </label>
          {p.audience === "ops" && p.canOverrideRefund && q.capturedCents > 0 && (
            <label className={labelClass}>
              Refund amount (AUD) — leave blank to apply the policy
              <input
                name="refundAmount"
                inputMode="decimal"
                placeholder={(q.refundCents / 100).toFixed(2)}
                className={fieldClasses(false, "mt-1")}
              />
            </label>
          )}
          {partnerMustAsk ? (
            <>
              <p className="text-muted-foreground text-xs">
                This booking is inside the {p.cutoffDays}-day cut-off, so Live Luxe must approve the cancellation. The
                policy above is what would apply.
              </p>
              <SubmitButton variant="outline" pendingLabel="Sending…">
                Send cancellation request
              </SubmitButton>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {q.kind === "withdraw"
                  ? "Closes the request and releases the dates and the card hold. This cannot be undone."
                  : "Releases the dates in Hostaway, refunds as shown and emails the partner. This cannot be undone."}
              </p>
              <ConfirmButton
                variant="outline"
                size="default"
                confirmLabel={q.kind === "withdraw" ? "Confirm withdrawal" : "Confirm cancellation"}
                pendingLabel="Cancelling…"
              >
                {verb}
              </ConfirmButton>
            </>
          )}
        </form>
      </details>
    </Panel>
  );
}
