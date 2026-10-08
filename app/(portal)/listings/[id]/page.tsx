import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble, Bath, Users, PawPrint, Clock, MapPin } from "lucide-react";
import { Gallery } from "@/components/listings/gallery";
import { AvailabilityStrip } from "@/components/listings/availability-strip";
import { QuotePanel } from "@/components/listings/quote-panel";
import { addDays, todayIn } from "@/lib/domain/dates";
import { buildAvailabilityStrip, parseSearchParams, searchQueryString } from "@/lib/domain/search";
import { formatMoney } from "@/lib/domain/money";
import { getCalendarDays, getListing } from "@/lib/listings/load";
import { priceStay } from "@/lib/listings/price";

const TZ = "Australia/Melbourne";
const STRIP_DAYS = 90;

export async function generateMetadata({ params }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const detail = await getListing(id);
  return { title: detail?.listing.public_name ?? "Property" };
}

const int = (v: string | string[] | undefined, fallback: number, min: number, max: number) => {
  const n = Number.parseInt((Array.isArray(v) ? v[0] : v) ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const time = (t: string | null) => (t ? t.slice(0, 5) : null);

/**
 * Listing detail (§13.3): photos, facts, description, amenities, next-90-days
 * availability and a server-rendered quote. The street address stays hidden until
 * a booking is approved; partners see suburb and an approximate map pin only.
 */
export default async function ListingPage({ params, searchParams }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const today = todayIn(TZ);

  const detail = await getListing(id);
  if (!detail) notFound();
  const { listing: l, images, amenities } = detail;

  // Dates/pets share the search parser; adults/children are specific to pricing.
  const parsed = parseSearchParams(sp, today);
  const adults = int(sp.adults, parsed.query.guests, 1, 20);
  const children = int(sp.children, 0, 0, 20);
  const pets = parsed.query.pets;
  const form = { checkIn: parsed.query.checkIn, checkOut: parsed.query.checkOut, adults, children, pets };

  const [strip, priced] = await Promise.all([
    getCalendarDays(id, today, addDays(today, STRIP_DAYS - 1)),
    parsed.hasDates
      ? priceStay(id, { checkIn: form.checkIn!, checkOut: form.checkOut!, adults, children, pets })
      : null,
  ]);

  const backHref = `/search${searchQueryString({ ...parsed.query, guests: adults + children, page: 1 })}`;
  const place = [l.suburb, l.state, l.postcode].filter(Boolean).join(" ");

  return (
    <div className="space-y-8">
      <Link href={backHref} className="text-ink-700 inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to search
      </Link>

      <Gallery images={images} name={l.public_name} />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <header>
            {place && (
              <p className="eyebrow mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden /> {place}
              </p>
            )}
            <h1 className="text-navy-900 font-serif text-3xl tracking-tight">{l.public_name}</h1>
            <ul className="text-ink-700 mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {l.bedrooms !== null && (
                <li className="flex items-center gap-1.5">
                  <BedDouble className="h-4 w-4" aria-hidden /> {l.bedrooms} {l.bedrooms === 1 ? "bedroom" : "bedrooms"}
                </li>
              )}
              {l.bathrooms !== null && (
                <li className="flex items-center gap-1.5">
                  <Bath className="h-4 w-4" aria-hidden /> {Number(l.bathrooms)}{" "}
                  {Number(l.bathrooms) === 1 ? "bathroom" : "bathrooms"}
                </li>
              )}
              {l.max_guests !== null && (
                <li className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" aria-hidden /> sleeps {l.max_guests}
                </li>
              )}
              <li className="flex items-center gap-1.5">
                <PawPrint className="h-4 w-4" aria-hidden />{" "}
                {l.max_pets > 0 ? `up to ${l.max_pets} ${l.max_pets === 1 ? "pet" : "pets"}` : "no pets"}
              </li>
            </ul>
            <p className="text-ink-500 mt-2 text-xs">The exact address is shared once a booking is approved.</p>
          </header>

          {l.description_html && (
            <section aria-labelledby="about-heading" className="space-y-2">
              <h2 id="about-heading" className="font-serif text-lg">
                About this property
              </h2>
              {/* Sanitised with DOMPurify at sync time (lib/hostaway/mappers.ts). */}
              <div
                className="prose-livluxe text-ink-700 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: l.description_html }}
              />
            </section>
          )}

          <AvailabilityStrip days={buildAvailabilityStrip(strip, today, STRIP_DAYS)} currency={l.currency} />

          <section aria-labelledby="stay-heading" className="space-y-3">
            <h2 id="stay-heading" className="font-serif text-lg">
              Stay details
            </h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-500 flex items-center gap-1 text-xs">
                  <Clock className="h-3 w-3" aria-hidden /> Check-in
                </dt>
                <dd className="text-navy-900">
                  {time(l.checkin_from)
                    ? `from ${time(l.checkin_from)}${time(l.checkin_to) ? ` to ${time(l.checkin_to)}` : ""}`
                    : "By arrangement"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500 flex items-center gap-1 text-xs">
                  <Clock className="h-3 w-3" aria-hidden /> Check-out
                </dt>
                <dd className="text-navy-900">
                  {time(l.checkout_by) ? `by ${time(l.checkout_by)}` : "By arrangement"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">Minimum stay</dt>
                <dd className="text-navy-900">
                  {l.min_nights} {l.min_nights === 1 ? "night" : "nights"}
                  {l.max_nights ? ` · up to ${l.max_nights} nights` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">Fees</dt>
                <dd className="text-navy-900">
                  Cleaning {l.cleaning_fee_cents ? formatMoney(l.cleaning_fee_cents, l.currency) : "included"}
                  {l.extra_person_fee_cents > 0 &&
                    ` · extra guest ${formatMoney(l.extra_person_fee_cents, l.currency)}/night above ${l.guests_included}`}
                  {l.security_deposit_cents > 0 && ` · deposit ${formatMoney(l.security_deposit_cents, l.currency)}`}
                </dd>
              </div>
            </dl>
          </section>

          {amenities.length > 0 && (
            <section aria-labelledby="amenities-heading" className="space-y-3">
              <h2 id="amenities-heading" className="font-serif text-lg">
                Amenities
              </h2>
              <ul className="flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <li
                    key={a.code}
                    className="border-cream-300 text-ink-700 rounded-full border bg-white px-3 py-1 text-xs"
                  >
                    {a.label ?? `Amenity ${a.code}`}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {l.house_rules && (
            <section aria-labelledby="rules-heading" className="space-y-2">
              <h2 id="rules-heading" className="font-serif text-lg">
                House rules
              </h2>
              <div
                className="prose-livluxe text-ink-700 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: l.house_rules }}
              />
            </section>
          )}
        </div>

        <QuotePanel
          form={form}
          today={today}
          currency={l.currency}
          errors={parsed.errors}
          result={priced ? { availability: priced.availability, quote: priced.quote } : null}
        />
      </div>
    </div>
  );
}
