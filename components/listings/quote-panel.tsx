import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QuoteLines } from "@/components/requests/quote-lines";
import type { AvailabilityResult } from "@/lib/domain/availability";
import type { Quote } from "@/lib/domain/quote-engine";
import { guestsSummary } from "@/lib/domain/requests";
import { formatDate, formatDayMonth } from "@/lib/utils";

const input = "border-cream-300 h-10 w-full rounded-md border bg-white px-3 text-sm";
const label = "text-ink-700 block text-xs font-medium";

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
 *
 * Fields are grouped by the question they answer — when, then who — and the result
 * restates the stay in words (en-AU dates, nights, guests) before any number, so a
 * date typed into a US-format browser picker is confirmed before it is trusted.
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
  const stay = result && form.checkIn && form.checkOut ? { checkIn: form.checkIn, checkOut: form.checkOut } : null;

  return (
    <aside className="border-cream-200 sticky top-4 rounded-xl border bg-white" aria-labelledby="quote-heading">
      <div className="space-y-4 p-5">
        <div>
          <h2 id="quote-heading" className="font-serif text-xl">
            Price a stay
          </h2>
          {!result && errors.length === 0 && (
            <p className="text-ink-500 mt-0.5 text-sm">Enter dates for live availability and a full breakdown.</p>
          )}
        </div>

        <form method="get" className="space-y-3">
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="sr-only">Dates</legend>
            <label className={label}>
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
            <label className={label}>
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
          </fieldset>
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className="sr-only">Guests</legend>
            <label className={label}>
              Adults
              <input
                name="adults"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                defaultValue={form.adults}
                className={`${input} mt-1`}
              />
            </label>
            <label className={label}>
              Children
              <input
                name="children"
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                defaultValue={form.children}
                className={`${input} mt-1`}
              />
            </label>
            <label className={label}>
              Pets
              <input
                name="pets"
                type="number"
                inputMode="numeric"
                min={0}
                max={5}
                defaultValue={form.pets}
                className={`${input} mt-1`}
              />
            </label>
          </fieldset>
          <Button type="submit" className="h-10 w-full">
            Get price
          </Button>
        </form>

        {errors.length > 0 && (
          <ul role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      {result && stay && (
        <div className="border-cream-200 space-y-4 border-t p-5">
          <div>
            <p className="text-navy-900 text-sm font-medium">
              {formatDate(stay.checkIn)} → {formatDate(stay.checkOut)}
            </p>
            <p className="text-ink-500 mt-0.5 text-xs">
              {result.availability.nights} {result.availability.nights === 1 ? "night" : "nights"} ·{" "}
              {guestsSummary(form.adults, form.children, form.pets)}
            </p>
          </div>

          {!result.availability.available && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
              <p className="font-medium">Not available</p>
              <p className="mt-0.5">{reasonText(result.availability)}</p>
              {result.availability.unavailableDates.length > 0 && (
                <p className="mt-1.5 text-xs">
                  Blocked:{" "}
                  {result.availability.unavailableDates
                    .slice(0, 6)
                    .map((d) => formatDayMonth(d))
                    .join(", ")}
                  {result.availability.unavailableDates.length > 6 && " …"}
                </p>
              )}
            </div>
          )}

          {result.availability.available && !result.quote && (
            <div className="bg-cream-50 border-cream-200 rounded-md border px-3 py-3 text-sm">
              <p className="text-navy-900 font-medium">Available · price on application</p>
              <p className="text-ink-500 mt-0.5 text-xs">
                Some nights have no rate loaded yet. Live Luxe will price this stay when you submit a request.
              </p>
            </div>
          )}

          {result.quote && (
            <>
              <QuoteLines
                lines={result.quote.lines}
                totalCents={result.quote.totalCents}
                depositCents={result.quote.securityDepositCents}
                currency={currency}
                nights={result.quote.nights}
              />
              <p className="text-ink-500 text-xs leading-relaxed">
                Indicative. Your organisation&apos;s contracted rates are applied when a request is submitted. GST is
                shown at the placeholder rate pending accountant sign-off.
              </p>
              {requestHref ? (
                <Button asChild variant="gold" className="h-10 w-full">
                  <Link href={requestHref}>Request to book</Link>
                </Button>
              ) : (
                <p className="text-ink-500 text-xs">Your role can view prices but not submit requests.</p>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
