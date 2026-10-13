import { ChevronDown } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui/pill";
import { fieldClasses, labelClass } from "@/components/ui/field";
import { Panel, PanelHeading } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import type { BookingModificationRow, BookingRequestRow } from "@/lib/db/types";
import { addDays } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { formatDate, formatTimestamp } from "@/lib/utils";

const STATUS_TONE: Record<BookingModificationRow["status"], PillTone> = {
  requested: "warn",
  approved: "ok",
  declined: "neutral",
  failed: "bad",
};

const KIND_LABEL: Record<BookingModificationRow["kind"], string> = {
  extension: "Extension",
  early_departure: "Early departure",
  guest_change: "Guest change",
};

interface Alternative {
  listingId: string;
  name: string;
  suburb: string | null;
  note: string;
}

/** One modification as a list row, with the alternatives surfaced when an extension was unavailable. */
function ModificationRow({ m, currency }: { m: BookingModificationRow; currency: string }) {
  const alts = Array.isArray(m.alternatives) ? (m.alternatives as unknown as Alternative[]) : [];
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-strong font-medium">
          {KIND_LABEL[m.kind]} · check-out {formatDate(m.old_check_out)} → {formatDate(m.new_check_out)}
        </span>
        <Pill tone={STATUS_TONE[m.status]}>{m.status}</Pill>
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs">
        Requested {formatTimestamp(m.requested_at)}
        {m.decided_at && ` · decided ${formatTimestamp(m.decided_at)}`}
        {m.delta_cents !== 0 &&
          ` · ${m.delta_cents > 0 ? "charge" : "refund"} ${formatMoney(Math.abs(m.delta_cents), currency)}`}
        {m.hostaway_status === "skipped" && " · Hostaway update skipped (writes disabled here)"}
      </p>
      {m.reason && <p className="text-foreground mt-1 text-xs italic">“{m.reason}”</p>}
      {m.decision_note && <p className="text-foreground mt-1 text-xs">Live Luxe: {m.decision_note}</p>}
      {alts.length > 0 && (
        <div className="bg-muted/50 mt-2 rounded-md px-3 py-2 text-xs">
          <p className="text-strong font-medium">
            The property is not available for those nights. Nearest alternatives:
          </p>
          <ul className="mt-1 space-y-0.5">
            {alts.map((a) => (
              <li key={a.listingId}>
                <a href={`/listings/${a.listingId}`} className="underline">
                  {a.name}
                </a>
                {a.suburb && <span className="text-muted-foreground">, {a.suburb}</span>} — {a.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export interface ModificationPanelProps {
  audience: "partner" | "ops";
  request: BookingRequestRow;
  modifications: BookingModificationRow[];
  /** Partner: may ask for changes. Ops: may decide. */
  canAct: boolean;
  /** Ops only: livluxe_finance / livluxe_admin may change the refund amount. */
  canOverrideRefund?: boolean;
}

/**
 * §10.6 extension and early departure. Partner side: two short forms that create a
 * modification request; the server quotes only the new nights and surfaces alternatives
 * when the property is unavailable. Ops side: approve (with an optional refund
 * override + mandatory reason for early departures) or decline each pending request.
 */
export function ModificationPanel(p: ModificationPanelProps) {
  const r = p.request;
  const live = r.status === "CONFIRMED" || r.status === "CHECKED_IN";
  if (!live && p.modifications.length === 0) return null;
  const pending = p.modifications.filter((m) => m.status === "requested");
  const partnerAction = `/api/requests/${r.id}/modify`;
  const opsAction = `/api/admin/requests/${r.id}`;

  return (
    <Panel aria-labelledby="modification-heading" className="print:hidden">
      <PanelHeading
        id="modification-heading"
        title="Changes to the stay"
        description={
          p.audience === "partner"
            ? "Extend the stay (we quote only the extra nights) or leave early (refund per the cancellation policy)."
            : "Extensions re-check availability live and raise a supplementary invoice; early departures refund per policy."
        }
        className="mb-2"
      />

      {p.modifications.length > 0 && (
        <ul className="divide-border divide-y">
          {p.modifications.map((m) => (
            <ModificationRow key={m.id} m={m} currency={r.currency} />
          ))}
        </ul>
      )}

      {p.audience === "ops" && p.canAct && pending.length > 0 && (
        <div className="mt-3 space-y-4">
          {pending.map((m) => (
            <form key={m.id} method="post" action={opsAction} className="border-border space-y-3 rounded-md border p-3">
              <input type="hidden" name="modificationId" value={m.id} />
              <p className="text-strong text-sm font-medium">
                Decide: {KIND_LABEL[m.kind].toLowerCase()} to {formatDate(m.new_check_out)}
                {m.delta_cents !== 0 &&
                  ` (${m.delta_cents > 0 ? "charge" : "policy refund"} ${formatMoney(Math.abs(m.delta_cents), r.currency)})`}
              </p>
              {m.kind === "early_departure" && p.canOverrideRefund && (
                <label className={labelClass}>
                  Refund amount (AUD) — leave blank to apply the policy; a reason is required if you change it
                  <input
                    name="refundAmount"
                    inputMode="decimal"
                    placeholder={(Math.abs(m.delta_cents) / 100).toFixed(2)}
                    className={fieldClasses(false, "mt-1")}
                  />
                </label>
              )}
              <label className={labelClass}>
                Note to the partner
                <textarea name="notes" rows={2} maxLength={500} className={fieldClasses(false, "mt-1")} />
              </label>
              <div className="flex flex-wrap gap-2">
                <SubmitButton
                  variant="gold"
                  name="action"
                  value="modification_approve"
                  pendingLabel={m.kind === "extension" ? "Checking availability…" : "Refunding…"}
                >
                  Approve {KIND_LABEL[m.kind].toLowerCase()}
                </SubmitButton>
                <ConfirmButton
                  variant="outline"
                  size="default"
                  name="action"
                  value="modification_decline"
                  confirmLabel="Confirm decline"
                  pendingLabel="Declining…"
                >
                  Decline
                </ConfirmButton>
              </div>
            </form>
          ))}
        </div>
      )}

      {p.audience === "partner" && p.canAct && live && pending.length === 0 && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <details className="group">
            <summary className="text-foreground flex cursor-pointer list-none items-center gap-1 text-sm font-medium">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
              Extend the stay
            </summary>
            <form method="post" action={partnerAction} className="mt-3 space-y-3">
              <input type="hidden" name="action" value="extend" />
              <label className={labelClass}>
                New check-out
                <input
                  name="newCheckOut"
                  type="date"
                  required
                  min={addDays(r.check_out, 1)}
                  className={fieldClasses(false, "mt-1")}
                />
              </label>
              <label className={labelClass}>
                Reason (optional)
                <textarea name="reason" rows={2} maxLength={500} className={fieldClasses(false, "mt-1")} />
              </label>
              <p className="text-muted-foreground text-xs">
                Only the additional nights are quoted. If the property is unavailable we show the nearest alternatives.
              </p>
              <SubmitButton variant="outline" pendingLabel="Checking…">
                Request extension
              </SubmitButton>
            </form>
          </details>

          <details className="group">
            <summary className="text-foreground flex cursor-pointer list-none items-center gap-1 text-sm font-medium">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
              Leave early
            </summary>
            <form method="post" action={partnerAction} className="mt-3 space-y-3">
              <input type="hidden" name="action" value="early_departure" />
              <label className={labelClass}>
                New check-out
                <input
                  name="newCheckOut"
                  type="date"
                  required
                  min={addDays(r.check_in, 1)}
                  max={addDays(r.check_out, -1)}
                  className={fieldClasses(false, "mt-1")}
                />
              </label>
              <label className={labelClass}>
                Reason (optional)
                <textarea name="reason" rows={2} maxLength={500} className={fieldClasses(false, "mt-1")} />
              </label>
              <p className="text-muted-foreground text-xs">
                The unused nights are refunded under the cancellation policy once Live Luxe approves.
              </p>
              <SubmitButton variant="outline" pendingLabel="Sending…">
                Request early departure
              </SubmitButton>
            </form>
          </details>
        </div>
      )}
    </Panel>
  );
}
