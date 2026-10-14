import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { DateRangeField } from "@/components/ui/date-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { QuoteLines } from "@/components/requests/quote-lines";
import type { AvailabilityResult } from "@/lib/domain/availability";
import type { Quote } from "@/lib/domain/quote-engine";
import { addDays } from "@/lib/domain/dates";
import { guestsSummary } from "@/lib/domain/requests";
import { cn, formatDate, formatDayMonth } from "@/lib/utils";
import { fieldClass, labelClass } from "@/components/ui/field";

export interface QuoteFormState {
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
  children: number;
  pets: number;
}

/** Brief §9.2: say what is wrong in the partner's terms (CAPACITY_EXCEEDED, MIN_STAY_NOT_MET, DATES_UNAVAILABLE). */
function reasonText(a: AvailabilityResult, form: QuoteFormState, limits: { maxGuests: number | null }): string {
  const guests = form.adults + form.children;
  switch (a.reason) {
    case "capacity":
      return limits.maxGuests !== null && guests > limits.maxGuests
        ? `This property sleeps ${limits.maxGuests}; you've entered ${guests} guests.`
        : "This property does not take that many pets.";
    case "min_stay":
      return `This property needs at least ${a.requiredMinStay} nights for these dates.`;
    case "max_stay":
      return "The stay is longer than this property allows in one booking.";
    case "closed_on_arrival":
      return "Check-in is not possible on that date. Try the day before or after.";
    case "closed_on_departure":
      return "Check-out is not possible on that date. Try the day before or after.";
    case "gap":
      return "We have not confirmed availability for some of these dates yet.";
    default:
      return "These dates are no longer available for this property.";
  }
}

/**
 * Price a stay (brief §7.4). A GET form keeps the stay in the URL; the result is
 * priced on the server exactly as a request would be. After pricing: the stay in
 * words, the full breakdown, how this partner pays, and one gold "Request this
 * property". When the dates do not work, the panel says why and what to try next.
 */
export function QuotePanel({
  form,
  today,
  currency,
  result,
  errors,
  requestHref,
  payLine,
  searchHref,
  askHref,
  basePath,
  maxGuests = null,
}: {
  form: QuoteFormState;
  today: string;
  currency: string;
  result: { availability: AvailabilityResult; quote: Quote | null } | null;
  errors: string[];
  /** Link to the request form; null when the viewer cannot submit requests. */
  requestHref: string | null;
  /** "Your card is held now and charged only if Live Luxe approves." */
  payLine: string | null;
  /** Search for other properties on these dates. */
  searchHref: string;
  /** mailto: Live Luxe for a quote or a manual search. */
  askHref: string;
  /** This property's page, for one-click fixes ("Extend to 7 nights"). */
  basePath?: string;
  maxGuests?: number | null;
}) {
  const stay = result && form.checkIn && form.checkOut ? { checkIn: form.checkIn, checkOut: form.checkOut } : null;
  const a = result?.availability;

  return (
    <aside
      id="price"
      className="border-subtle bg-surface rounded-card scroll-mt-24 border lg:sticky lg:top-20"
      aria-labelledby="quote-heading"
    >
      <div className="space-y-4 p-5">
        <div>
          <h2 id="quote-heading">Price a stay</h2>
          {!result && errors.length === 0 && (
            <p className="text-text-secondary text-body-sm mt-0.5">
              Choose dates for live availability and the full price.
            </p>
          )}
        </div>

        <form method="get" action="#price" className="space-y-3">
          <DateRangeField label="Dates" defaultFrom={form.checkIn} defaultTo={form.checkOut} min={today} required />
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className="sr-only">Who is staying</legend>
            <label className={labelClass}>
              Adults
              <input
                name="adults"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                defaultValue={form.adults}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className={labelClass}>
              Children
              <input
                name="children"
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                defaultValue={form.children}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className={labelClass}>
              Pets
              <input
                name="pets"
                type="number"
                inputMode="numeric"
                min={0}
                max={5}
                defaultValue={form.pets}
                className={`${fieldClass} mt-1`}
              />
            </label>
          </fieldset>
          <SubmitButton variant={result?.quote ? "secondary" : "primary"} className="w-full" pendingLabel="Pricing…">
            {result ? "Update price" : "Get price"}
          </SubmitButton>
        </form>

        {errors.length > 0 && (
          <ul
            role="alert"
            className="border-danger-border bg-danger-bg text-danger-fg rounded-control border px-3 py-2"
          >
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      {result && stay && a && (
        <div className="border-subtle space-y-4 border-t p-5">
          <div>
            <p className="text-text-primary font-semibold">
              {formatDate(stay.checkIn)} → {formatDate(stay.checkOut)}
            </p>
            <p className="text-text-secondary text-body-sm mt-0.5">
              {a.nights} {a.nights === 1 ? "night" : "nights"} · {guestsSummary(form.adults, form.children, form.pets)}
            </p>
          </div>

          {!a.available && (
            <div role="status" className="border-danger-border bg-danger-bg rounded-control border px-3 py-3">
              <p className="text-danger-fg font-semibold">Not available for these dates</p>
              <p className="text-text-primary text-body-sm mt-0.5">{reasonText(a, form, { maxGuests })}</p>
              {a.unavailableDates.length > 0 && (
                <p className="text-text-secondary text-body-sm mt-1.5">
                  Booked:{" "}
                  {a.unavailableDates
                    .slice(0, 6)
                    .map((d) => formatDayMonth(d))
                    .join(", ")}
                  {a.unavailableDates.length > 6 && " …"}
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                {a.reason === "min_stay" && basePath && stay && a.requiredMinStay > a.nights && (
                  <Link
                    href={`${basePath}?${new URLSearchParams({
                      checkIn: stay.checkIn,
                      checkOut: addDays(stay.checkIn, a.requiredMinStay),
                      adults: String(form.adults),
                      children: String(form.children),
                      pets: String(form.pets),
                    }).toString()}#price`}
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full")}
                  >
                    Extend to {a.requiredMinStay} nights
                  </Link>
                )}
                <Link href={searchHref} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full")}>
                  {a.reason === "capacity" && maxGuests !== null && form.adults + form.children > maxGuests
                    ? `Find properties that sleep ${form.adults + form.children}`
                    : "See what else is free for these dates"}
                </Link>
                <a href={askHref} className={cn(buttonVariants({ variant: "tertiary", size: "sm" }), "w-full")}>
                  Ask Live Luxe to find one
                </a>
              </div>
              <p className="text-text-muted text-body-sm mt-2">Or pick open dates on the calendar below.</p>
            </div>
          )}

          {a.available && !result.quote && (
            <div className="border-subtle bg-inset rounded-control border px-3 py-3">
              <p className="text-text-primary font-semibold">Available · price on application</p>
              <p className="text-text-secondary text-body-sm mt-0.5">
                Some nights have no rate loaded yet. Live Luxe will quote this stay for you.
              </p>
              <a href={askHref} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3 w-full")}>
                Ask for a quote
              </a>
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
              {payLine && <p className="text-text-primary text-body-sm">{payLine}</p>}
              <p className="text-text-muted text-body-sm leading-relaxed">
                Your organisation&apos;s contracted rates are applied when you send the request. GST is shown at the
                standard rate until Live Luxe&apos;s accountant confirms the treatment of long stays.
              </p>
              {requestHref ? (
                <Link href={requestHref} className={cn(buttonVariants({ variant: "primary" }), "w-full")}>
                  Request this property
                </Link>
              ) : (
                <p className="text-text-muted text-body-sm">
                  Your role can see prices but not send requests. Ask an admin in your team.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
