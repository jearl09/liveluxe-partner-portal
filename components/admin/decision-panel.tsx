import { Button } from "@/components/ui/button";
import { DECLINE_REASON_CODES } from "@/lib/domain/booking-state-machine";
import { DECLINE_REASON_LABELS } from "@/lib/domain/requests";
import type { BookingRequestRow } from "@/lib/db/types";

const input = "border-cream-300 h-10 w-full rounded-md border bg-white px-3 text-sm";

/**
 * Ops actions for one request (§13.4). Three plain forms posting to the same route;
 * the server validates the transition, so a stale page cannot do the wrong thing.
 */
export function DecisionPanel({ request: r, today }: { request: BookingRequestRow; today: string }) {
  const action = `/api/admin/requests/${r.id}`;
  const decidable = r.status === "SUBMITTED" || r.status === "UNDER_REVIEW";

  if (!decidable) {
    return (
      <div className="border-cream-200 rounded-xl border bg-white p-5 text-sm">
        <h2 className="mb-2 font-serif text-xl">Decision</h2>
        <p className="text-ink-700">
          {r.status === "COUNTER_OFFERED"
            ? "Waiting for the partner to answer the counter-offer. The SLA clock is paused."
            : r.status === "APPROVED"
              ? "Approved. Payment capture and the Hostaway reservation follow in the confirmation step."
              : "No further decision is possible in this state."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-cream-200 rounded-xl border bg-white p-5">
        <h2 className="mb-1 font-serif text-xl">Approve</h2>
        <p className="text-ink-500 mb-3 text-xs">
          Re-checks live availability in Hostaway, then reserves the dates for this partner.
        </p>
        <form method="post" action={action}>
          <input type="hidden" name="action" value="approve" />
          <Button type="submit" variant="gold" className="w-full">
            Approve request
          </Button>
        </form>
      </div>

      <details className="border-cream-200 group rounded-xl border bg-white p-5">
        <summary className="cursor-pointer font-serif text-xl">Counter-offer</summary>
        <form method="post" action={action} className="mt-3 space-y-3">
          <input type="hidden" name="action" value="counter" />
          <label className="block text-xs font-medium">
            New total (AUD, incl. GST)
            <input
              name="newTotal"
              inputMode="decimal"
              placeholder={r.total_cents != null ? (r.total_cents / 100).toFixed(2) : ""}
              className={`${input} mt-1`}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium">
              New check-in
              <input name="newCheckIn" type="date" min={today} className={`${input} mt-1`} />
            </label>
            <label className="block text-xs font-medium">
              New check-out
              <input name="newCheckOut" type="date" min={today} className={`${input} mt-1`} />
            </label>
          </div>
          <label className="block text-xs font-medium">
            Message to the partner <span className="text-gold-600">*</span>
            <textarea
              name="message"
              rows={3}
              required
              maxLength={1000}
              className="border-cream-300 mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <p className="text-ink-500 text-xs">
            Leave a field blank to keep it as is. The hold is extended while the partner decides.
          </p>
          <Button type="submit" variant="outline" className="w-full">
            Send counter-offer
          </Button>
        </form>
      </details>

      <details className="border-cream-200 rounded-xl border bg-white p-5">
        <summary className="cursor-pointer font-serif text-xl">Decline</summary>
        <form method="post" action={action} className="mt-3 space-y-3">
          <input type="hidden" name="action" value="decline" />
          <label className="block text-xs font-medium">
            Reason <span className="text-gold-600">*</span>
            <select name="reason" required className={`${input} mt-1`} defaultValue="">
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
          <label className="block text-xs font-medium">
            Note to the partner
            <textarea
              name="notes"
              rows={2}
              maxLength={1000}
              className="border-cream-300 mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              placeholder="Optional. Suggest alternatives if you can."
            />
          </label>
          <Button type="submit" variant="destructive" className="w-full">
            Decline request
          </Button>
        </form>
      </details>
    </div>
  );
}
