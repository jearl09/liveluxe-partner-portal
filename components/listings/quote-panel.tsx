import Link from "next/link";
import { Calculator, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AvailabilityResult } from "@/lib/domain/availability";
import type { Quote } from "@/lib/domain/quote-engine";
import { formatMoney } from "@/lib/domain/money";
import { formatDate } from "@/lib/utils";

const input = "border-cream-300 h-10 w-full rounded-md border bg-white px-3 text-sm";

export interface QuoteFormState {
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
  children: number;
  pets: number;
}

function reasonText(a: AvailabilityResult): string {
  switch (a.reason) {
    case "capacity":
      return "The guest or pet count is above this property's limit.";
    case "min_stay":
      return `These dates need a minimum stay of ${a.requiredMinStay} nights.`;
    case "max_stay":
      return "The stay is longer than this property allows in one booking.";
    case "closed_on_arrival":
      return "Check-in is not possible on that date. Try the day before or after.";
    case "closed_on_departure":
      return "Check-out is not possible on that date. Try the day before or after.";
    case "gap":
      return "Availability for some of these dates has not been synced yet.";
    default:
      return "Some of these nights are already booked or blocked.";
  }
}

/**
 * Right-hand pricing panel (§13.3). A GET form keeps the stay in the URL; the result
 * is computed server-side by lib/listings/price so it matches POST /api/quotes exactly.
 */
export function QuotePanel({
  form,
  today,
  currency,
  result,
  errors,
  requestHref,
}: {
  form: QuoteFormState;
  today: string;
  currency: string;
  result: { availability: AvailabilityResult; quote: Quote | null } | null;
  errors: string[];
  /** Link to the submission form; null when the viewer cannot submit requests. */
  requestHref: string | null;
}) {
  return (
    <aside
      className="border-cream-200 sticky top-4 space-y-4 rounded-xl border bg-white p-5"
      aria-labelledby="quote-heading"
    >
      <h2 id="quote-heading" className="flex items-center gap-2 font-serif text-lg">
        <Calculator className="text-gold-600 h-4 w-4" aria-hidden /> Price a stay
      </h2>
      <form method="get" className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium">
          Check-in
          <input
            name="checkIn"
            type="date"
            min={today}
            defaultValue={form.checkIn ?? ""}
            className={`${input} mt-1`}
            required
          />
        </label>
        <label className="block text-xs font-medium">
          Check-out
          <input
            name="checkOut"
            type="date"
            min={today}
            defaultValue={form.checkOut ?? ""}
            className={`${input} mt-1`}
            required
          />
        </label>
        <label className="block text-xs font-medium">
          Adults
          <input name="adults" type="number" min={1} max={20} defaultValue={form.adults} className={`${input} mt-1`} />
        </label>
        <label className="block text-xs font-medium">
          Children
          <input
            name="children"
            type="number"
            min={0}
            max={20}
            defaultValue={form.children}
            className={`${input} mt-1`}
          />
        </label>
        <label className="block text-xs font-medium">
          Pets
          <input name="pets" type="number" min={0} max={5} defaultValue={form.pets} className={`${input} mt-1`} />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="h-10 w-full">
            Get price
          </Button>
        </div>
      </form>

      {errors.length > 0 && (
        <ul role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {result && !result.availability.available && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
          <p className="font-medium">Not available</p>
          <p className="mt-0.5">{reasonText(result.availability)}</p>
          {result.availability.unavailableDates.length > 0 && (
            <p className="mt-1 text-xs">
              Blocked:{" "}
              {result.availability.unavailableDates
                .slice(0, 6)
                .map((d) => formatDate(d))
                .join(", ")}
              {result.availability.unavailableDates.length > 6 && " …"}
            </p>
          )}
        </div>
      )}

      {result && result.availability.available && !result.quote && (
        <div className="bg-cream-50 border-cream-200 rounded-md border px-3 py-3 text-sm">
          <p className="text-navy-900 font-medium">Available · price on application</p>
          <p className="text-ink-500 mt-0.5 text-xs">
            Some nights have no rate loaded yet. Live Luxe will price this stay when you submit a request.
          </p>
        </div>
      )}

      {result?.quote && (
        <div className="space-y-3">
          <table className="w-full text-sm">
            <caption className="sr-only">Quote breakdown</caption>
            <tbody>
              {result.quote.lines.map((l) => (
                <tr key={l.kind + l.label} className="border-cream-200 border-b last:border-0">
                  <td className="text-ink-700 py-1.5 pr-2">{l.label}</td>
                  <td className="text-navy-900 py-1.5 text-right font-mono text-xs whitespace-nowrap">
                    {l.amountCents < 0 ? "−" : ""}
                    {formatMoney(Math.abs(l.amountCents), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="text-navy-900 pt-3 font-medium">Total</td>
                <td className="text-navy-900 pt-3 text-right font-serif text-xl">
                  {formatMoney(result.quote.totalCents, currency)}
                </td>
              </tr>
              <tr>
                <td className="text-ink-500 text-xs" colSpan={2}>
                  {formatMoney(result.quote.nightlyAverageCents, currency)} average per night · {result.quote.nights}{" "}
                  nights
                </td>
              </tr>
            </tfoot>
          </table>
          {result.quote.securityDepositCents > 0 && (
            <p className="text-ink-500 text-xs">
              Security deposit {formatMoney(result.quote.securityDepositCents, currency)} is authorised separately and
              not charged unless needed.
            </p>
          )}
          <p className="text-ink-500 flex items-start gap-1.5 text-xs">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Indicative. Your organisation&apos;s contracted rates are applied when a request is submitted. GST shown at
            the placeholder rate pending accountant sign-off.
          </p>
          {requestHref ? (
            <Button asChild variant="gold" className="w-full">
              <Link href={requestHref}>Request to book</Link>
            </Button>
          ) : (
            <p className="text-ink-500 text-xs">Your role can view prices but not submit requests.</p>
          )}
        </div>
      )}

      {!result && errors.length === 0 && (
        <p className="text-ink-500 text-xs">Enter dates to see live availability and a full price breakdown.</p>
      )}
    </aside>
  );
}
