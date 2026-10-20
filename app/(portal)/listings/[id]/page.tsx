import Link from "next/link";
import { notFound } from "next/navigation";
import { Accessibility, ArrowLeft, Bath, BedDouble, Car, MoveVertical, PawPrint, Users } from "lucide-react";
import { AvailabilityStrip } from "@/components/listings/availability-strip";
import { PropertyDescription } from "@/components/listings/description";
import { Gallery } from "@/components/listings/gallery";
import { HouseRules } from "@/components/listings/house-rules";
import { QuotePanel } from "@/components/listings/quote-panel";
import { SyncState } from "@/components/ui/states";
import { getSessionClaims } from "@/lib/db/server";
import { loadSyncState } from "@/lib/listings/sync";
import { amenityFacts, curateAmenities, groupAmenities } from "@/lib/domain/amenities";
import { addDays, todayIn } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { PAY_MODE_SENTENCE, paymentModeFor } from "@/lib/domain/payments";
import { can } from "@/lib/domain/permissions";
import { partnerPropertyName } from "@/lib/domain/property-name";
import { parseSearchParams, searchQueryString } from "@/lib/domain/search";
import { buildStayCalendar, nearestOpenStays } from "@/lib/domain/stay-picker";
import { env } from "@/lib/env";
import { getCalendarDays, getListing, getTakenRanges } from "@/lib/listings/load";
import { priceStay } from "@/lib/listings/price";
import { orgPaymentTerms } from "@/lib/payments/load";
import { loadDoorCodeOffsetSetting, loadOffsetSetting } from "@/lib/requests/checkin";
import { formatClock, formatDate } from "@/lib/utils";

const TZ = "Australia/Melbourne";
const STRIP_DAYS = 90;
/** The picker reaches as far as the calendar sync does (spec §6.4: 400 days). */
const PICKER_DAYS = 400;
const VISIBLE_AMENITIES = 12;

export async function generateMetadata({ params }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const detail = await getListing(id);
  return {
    title: detail ? partnerPropertyName(detail.listing.public_name, detail.listing.internal_name) : "Property",
  };
}

const int = (v: string | string[] | undefined, fallback: number, min: number, max: number) => {
  const n = Number.parseInt((Array.isArray(v) ? v[0] : v) ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Property detail (brief §7.4): is this the right place, and what will it cost for my
 * dates. Gallery, the facts at a glance, then the price panel (sticky beside the page
 * from 1024 px, straight after the title on a phone), availability you can pick dates
 * from, stay details, what is shared when, curated amenities and the house rules.
 * The street address stays hidden until a booking is approved.
 */
export default async function ListingPage({ params, searchParams }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const today = todayIn(TZ);
  const now = new Date();

  const [detail, claims] = await Promise.all([getListing(id), getSessionClaims()]);
  if (!detail) notFound();
  const canSubmit = !!claims && can(claims.role, "requests.submit");
  const { listing: l, images, amenities } = detail;
  const name = partnerPropertyName(l.public_name, l.internal_name);

  const parsed = parseSearchParams(sp, today);
  const adults = int(sp.adults, parsed.query.guests, 1, 20);
  const children = int(sp.children, 0, 0, 20);
  const pets = parsed.query.pets;
  const form = { checkIn: parsed.query.checkIn, checkOut: parsed.query.checkOut, adults, children, pets };

  const [calendarDays, taken, priced, terms, offsetDefault, doorOffsetDefault, sync] = await Promise.all([
    getCalendarDays(id, today, addDays(today, PICKER_DAYS)),
    getTakenRanges(id, today, addDays(today, PICKER_DAYS)),
    parsed.hasDates
      ? priceStay(
          id,
          { checkIn: form.checkIn!, checkOut: form.checkOut!, adults, children, pets },
          { orgId: claims?.org_id },
        )
      : null,
    claims?.org_id ? orgPaymentTerms(claims.org_id) : Promise.resolve(null),
    loadOffsetSetting(),
    loadDoorCodeOffsetSetting(),
    loadSyncState(now),
  ]);
  const offset = l.checkin_release_offset_hours ?? offsetDefault;
  const doorOffset = Math.min(offset, doorOffsetDefault);
  // One source for the picker, the calendar and the hints: synced nights plus holds and approved bookings.
  const cal = buildStayCalendar(calendarDays, taken, today, PICKER_DAYS, {
    minNights: l.min_nights,
    maxNights: l.max_nights,
  });
  const refused = priced && !priced.availability.available ? priced.availability : null;
  const conflicts = refused ? [...refused.unavailableDates, ...refused.missingDates] : [];
  const nearest =
    refused && form.checkIn && refused.reason !== "capacity"
      ? nearestOpenStays(cal, form.checkIn, Math.max(refused.nights, refused.requiredMinStay))
      : [];

  const curated = curateAmenities(amenities.map((a) => a.label));
  const groups = groupAmenities(curated);
  const facts = amenityFacts(curated);

  const backHref = `/search${searchQueryString({ ...parsed.query, guests: adults + children, page: 1 })}`;
  const searchHref = `/search${searchQueryString({ ...parsed.query, q: l.suburb ?? "", guests: adults + children, page: 1 })}`;
  const stayWords =
    form.checkIn && form.checkOut ? `${formatDate(form.checkIn)} to ${formatDate(form.checkOut)}` : "dates to follow";
  const askHref = `mailto:${env().EMAIL_REPLY_TO}?subject=${encodeURIComponent(
    `Quote request: ${name}`,
  )}&body=${encodeURIComponent(
    `Property: ${name}${l.suburb ? `, ${l.suburb}` : ""}\nDates: ${stayWords}\nAdults: ${adults}  Children: ${children}  Pets: ${pets}\n\nNotes:\n`,
  )}`;
  const place = [l.suburb, l.state, l.postcode].filter(Boolean).join(" · ");
  const chip =
    "border-subtle bg-surface text-text-primary text-body-sm rounded-pill inline-flex items-center gap-1.5 border px-3 py-1";
  const t = (v: string | null) => formatClock(v);

  return (
    <div className="space-y-8">
      <Link
        href={backHref}
        className="text-text-secondary hover:text-text-primary text-body-sm inline-flex items-center gap-1 font-semibold"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to search
      </Link>

      <Gallery images={images} name={name} />

      {/* Phone: title → price panel → details. From 1024 px: 8/4 with the panel sticky. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)] lg:grid-rows-[auto_1fr]">
        <header className="space-y-3">
          {place && <p className="eyebrow">{place}</p>}
          <h1 className="text-h1 text-text-primary font-serif tracking-tight">{name}</h1>
          <ul className="flex flex-wrap gap-2" aria-label="At a glance">
            {l.bedrooms !== null && (
              <li className={chip}>
                <BedDouble className="h-4 w-4" aria-hidden /> {l.bedrooms} {l.bedrooms === 1 ? "bedroom" : "bedrooms"}
              </li>
            )}
            {l.bathrooms !== null && (
              <li className={chip}>
                <Bath className="h-4 w-4" aria-hidden /> {Number(l.bathrooms)}{" "}
                {Number(l.bathrooms) === 1 ? "bathroom" : "bathrooms"}
              </li>
            )}
            {l.max_guests !== null && (
              <li className={chip}>
                <Users className="h-4 w-4" aria-hidden /> Sleeps {l.max_guests}
              </li>
            )}
            <li className={chip}>
              <PawPrint className="h-4 w-4" aria-hidden />
              {l.max_pets > 0 ? `Up to ${l.max_pets} ${l.max_pets === 1 ? "pet" : "pets"}` : "No pets"}
            </li>
            {facts.parking && (
              <li className={chip}>
                <Car className="h-4 w-4" aria-hidden /> {facts.parking}
              </li>
            )}
            {facts.lift && (
              <li className={chip}>
                <MoveVertical className="h-4 w-4" aria-hidden /> Lift
              </li>
            )}
            {facts.accessible && (
              <li className={chip}>
                <Accessibility className="h-4 w-4" aria-hidden /> Wheelchair access
              </li>
            )}
          </ul>
          <SyncState model={sync} audience="partner" />
          <p className="text-text-muted text-body-sm">The exact address is shared once your request is approved.</p>
        </header>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <QuotePanel
            form={form}
            cal={cal}
            nearest={nearest}
            currency={l.currency}
            errors={parsed.errors}
            result={priced ? { availability: priced.availability, quote: priced.quote } : null}
            requestHref={
              canSubmit && priced?.quote && form.checkIn && form.checkOut
                ? `/requests/new?listingId=${id}&checkIn=${form.checkIn}&checkOut=${form.checkOut}&adults=${adults}&children=${children}&pets=${pets}`
                : null
            }
            payLine={claims ? PAY_MODE_SENTENCE[paymentModeFor(terms)] : null}
            searchHref={searchHref}
            askHref={askHref}
            basePath={`/listings/${id}`}
            maxGuests={l.max_guests}
          />
        </div>

        <div className="min-w-0 space-y-8">
          <AvailabilityStrip
            cal={cal}
            count={STRIP_DAYS}
            currency={l.currency}
            today={today}
            selected={form.checkIn && form.checkOut ? { checkIn: form.checkIn, checkOut: form.checkOut } : null}
            conflicts={conflicts}
          />

          <section aria-labelledby="stay-heading" className="space-y-3">
            <h2 id="stay-heading">Stay details</h2>
            <dl className="border-subtle divide-subtle rounded-card bg-surface grid divide-y border sm:grid-cols-2 sm:divide-y-0">
              {[
                [
                  "Check-in",
                  t(l.checkin_from)
                    ? `From ${t(l.checkin_from)}${t(l.checkin_to) ? ` to ${t(l.checkin_to)}` : ""}`
                    : "By arrangement",
                ],
                ["Check-out", t(l.checkout_by) ? `By ${t(l.checkout_by)}` : "By arrangement"],
                [
                  "Length of stay",
                  `${l.min_nights} ${l.min_nights === 1 ? "night" : "nights"} minimum${l.max_nights ? `, ${l.max_nights} maximum` : ""}`,
                ],
                [
                  "Fees",
                  [
                    `Cleaning ${l.cleaning_fee_cents ? formatMoney(l.cleaning_fee_cents, l.currency) : "included"}`,
                    l.extra_person_fee_cents > 0
                      ? `extra guest ${formatMoney(l.extra_person_fee_cents, l.currency)} a night above ${l.guests_included}`
                      : null,
                    l.security_deposit_cents > 0
                      ? `bond ${formatMoney(l.security_deposit_cents, l.currency)} held, not charged`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                ],
              ].map(([k, v], i) => (
                <div key={k} className={i > 1 ? "sm:border-subtle px-4 py-3 sm:border-t" : "px-4 py-3"}>
                  <dt className="text-text-muted text-body-sm">{k}</dt>
                  <dd className="text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="access-heading" className="space-y-3">
            <h2 id="access-heading">Check-in and access</h2>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                ["Now", "The suburb, the building type and the photos you see here."],
                ["When Live Luxe approves", "The street address and the check-in window."],
                [
                  `${offset} hours before check-in`,
                  `Wi-Fi and directions, in the booking and by email${doorOffset < offset ? `; the door or key-box code ${doorOffset} hours before` : ", with the door or key-box code"}.`,
                ],
              ].map(([when, what], i) => (
                <li key={when} className="border-subtle bg-surface rounded-card border p-4">
                  <span className="text-text-muted text-body-sm font-semibold tabular-nums">Step {i + 1}</span>
                  <p className="text-text-primary mt-1 font-semibold">{when}</p>
                  <p className="text-text-secondary text-body-sm mt-1">{what}</p>
                </li>
              ))}
            </ol>
          </section>

          <PropertyDescription html={l.description_html} />

          {groups.length > 0 && (
            <section aria-labelledby="amenities-heading" className="space-y-4">
              <h2 id="amenities-heading">Amenities</h2>
              <AmenityGroups groups={groups} visible={VISIBLE_AMENITIES} total={curated.length} />
            </section>
          )}

          <HouseRules html={l.house_rules} />
        </div>
      </div>
    </div>
  );
}

function AmenityGroups({
  groups,
  visible,
  total,
}: {
  groups: { group: string; items: string[] }[];
  visible: number;
  total: number;
}) {
  // About twelve, a few from each group so the preview shows the range; the rest behind "Show all".
  const per = Math.max(2, Math.ceil(visible / groups.length));
  const shown = groups.map((g) => ({ group: g.group, items: g.items.slice(0, per) }));
  const list = (gs: { group: string; items: string[] }[]) => (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {gs.map((g) => (
        <div key={g.group}>
          <h3 className="text-text-primary text-body-sm font-semibold">{g.group}</h3>
          <ul className="text-text-secondary mt-1.5 space-y-1">
            {g.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
  if (total <= visible) return list(groups);
  return (
    <details className="group">
      <summary className="list-none [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{list(shown)}</span>
        <span className="text-text-primary mt-4 inline-flex cursor-pointer font-semibold underline underline-offset-4 group-open:hidden">
          Show all {total} amenities
        </span>
        <span className="text-text-primary hidden cursor-pointer font-semibold underline underline-offset-4 group-open:inline-flex">
          Show fewer
        </span>
      </summary>
      <div className="mt-4">{list(groups)}</div>
    </details>
  );
}
