import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Flash } from "@/components/requests/flash";
import { QuoteLines } from "@/components/requests/quote-lines";
import { StayCard } from "@/components/requests/stay-card";
import { getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
import { can } from "@/lib/domain/permissions";
import { parseSearchParams, searchQueryString } from "@/lib/domain/search";
import { priceStay } from "@/lib/listings/price";
import { loadOrgRules } from "@/lib/requests/submit";

export const metadata = { title: "Request to book" };

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const int = (v: string | string[] | undefined, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(str(v), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const input = "border-cream-300 h-10 w-full rounded-md border bg-white px-3 text-sm";
const FIELD_LABELS: Record<string, string> = {
  guestName: "Guest name",
  guestEmail: "Guest email",
  claimRef: "Claim reference",
  poNumber: "PO number",
  acceptTerms: "Confirmation",
};

/**
 * Submission form (§7.1): the quote is re-priced here and again at submit; the
 * price hash travels with the form so a changed price is caught, never silently applied.
 */
export default async function NewRequestPage({ searchParams }: PageProps<"/requests/new">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  if (!can(claims.role, "requests.submit")) redirect("/requests?error=FORBIDDEN");
  const sp = await searchParams;

  const listingId = str(sp.listingId);
  const parsed = parseSearchParams(sp, todayIn("Australia/Melbourne"));
  if (!listingId || !parsed.hasDates) notFound();
  const adults = int(sp.adults, parsed.query.guests, 1, 20);
  const children = int(sp.children, 0, 0, 20);
  const pets = parsed.query.pets;
  const stay = { checkIn: parsed.query.checkIn!, checkOut: parsed.query.checkOut!, adults, children, pets };

  const [priced, org] = await Promise.all([priceStay(listingId, stay), loadOrgRules(claims.org_id)]);
  if (!priced) notFound();
  const l = priced.detail.listing;
  const back = `/listings/${listingId}${searchQueryString({ checkIn: stay.checkIn, checkOut: stay.checkOut, pets })}&adults=${adults}&children=${children}`;
  const errorFields = new Set(str(sp.fields).split(",").filter(Boolean));
  const quote = priced.availability.available ? priced.quote : null;

  return (
    <div className="space-y-6">
      <Link href={back} className="text-ink-700 inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to property
      </Link>
      <PageHeader
        eyebrow="Booking request"
        title="Request to book"
        description={`Submitting on behalf of ${org.name}.`}
      />

      <Flash
        error={str(sp.error) || undefined}
        detail={str(sp.detail) || undefined}
        refCode={str(sp.ref) || undefined}
      />
      {errorFields.size > 0 && (
        <p className="text-sm text-red-900">
          Please fix: {[...errorFields].map((f) => FIELD_LABELS[f] ?? f).join(", ")}.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <form method="post" action="/api/requests" className="space-y-6">
          <input type="hidden" name="listingId" value={listingId} />
          <input type="hidden" name="checkIn" value={stay.checkIn} />
          <input type="hidden" name="checkOut" value={stay.checkOut} />
          <input type="hidden" name="adults" value={adults} />
          <input type="hidden" name="children" value={children} />
          <input type="hidden" name="pets" value={pets} />
          <input type="hidden" name="priceHash" value={quote?.priceHash ?? ""} />

          <section className="border-cream-200 space-y-4 rounded-xl border bg-white p-5">
            <h2 className="font-serif text-xl">Guest</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-medium">
                Guest name <span className="text-gold-600">*</span>
                <input
                  name="guestName"
                  required
                  defaultValue={str(sp.guestName)}
                  className={`${input} mt-1`}
                  maxLength={120}
                />
              </label>
              <label className="block text-xs font-medium">
                Guest email
                <input name="guestEmail" type="email" defaultValue={str(sp.guestEmail)} className={`${input} mt-1`} />
              </label>
              <label className="block text-xs font-medium">
                Guest phone
                <input name="guestPhone" defaultValue={str(sp.guestPhone)} className={`${input} mt-1`} maxLength={40} />
              </label>
            </div>
            <p className="text-ink-500 text-xs">Guest details are shared with Live Luxe only for this stay.</p>
          </section>

          <section className="border-cream-200 space-y-4 rounded-xl border bg-white p-5">
            <h2 className="font-serif text-xl">Your references</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-xs font-medium">
                Claim reference {org.require_claim_ref && <span className="text-gold-600">*</span>}
                <input
                  name="claimRef"
                  required={org.require_claim_ref}
                  defaultValue={str(sp.claimRef)}
                  className={`${input} mt-1`}
                  maxLength={60}
                />
              </label>
              <label className="block text-xs font-medium">
                PO number {org.require_po_number && <span className="text-gold-600">*</span>}
                <input
                  name="poNumber"
                  required={org.require_po_number}
                  defaultValue={str(sp.poNumber) || (org.default_po_number ?? "")}
                  className={`${input} mt-1`}
                  maxLength={60}
                />
              </label>
              <label className="block text-xs font-medium">
                Cost centre
                <input
                  name="costCentre"
                  defaultValue={str(sp.costCentre) || (org.default_cost_centre ?? "")}
                  className={`${input} mt-1`}
                  maxLength={60}
                />
              </label>
            </div>
            <label className="block text-xs font-medium">
              Notes for Live Luxe
              <textarea
                name="notes"
                rows={3}
                defaultValue={str(sp.notes)}
                className="border-cream-300 mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                maxLength={2000}
                placeholder="Access needs, arrival time, anything the team should know"
              />
            </label>
          </section>

          <section className="border-cream-200 space-y-3 rounded-xl border bg-white p-5">
            <label className="flex items-start gap-3 text-sm">
              <input name="acceptTerms" type="checkbox" required className="mt-1" />
              <span>
                I confirm the stay details and the quoted total, and that this request is made under {org.name}&apos;s
                agreement with Live Luxe. The dates are held for Live Luxe&apos;s decision; nothing is charged until
                approval.
              </span>
            </label>
            <Button type="submit" variant="gold" className="w-full sm:w-auto" disabled={!quote}>
              Submit request
            </Button>
            {!quote && (
              <p className="text-sm text-red-900">
                This stay can no longer be priced online for these dates. Go back and choose different dates.
              </p>
            )}
          </section>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <StayCard
            listing={{
              name: l.public_name,
              suburb: l.suburb,
              state: l.state,
              imageUrl: priced.detail.images[0]?.url ?? null,
            }}
            checkIn={stay.checkIn}
            checkOut={stay.checkOut}
            nights={priced.availability.nights}
            adults={adults}
            childGuests={children}
            pets={pets}
          />
          {quote && (
            <div className="border-cream-200 rounded-xl border bg-white p-5">
              <h2 className="mb-3 font-serif text-xl">Quote</h2>
              <QuoteLines
                lines={quote.lines}
                totalCents={quote.totalCents}
                depositCents={quote.securityDepositCents}
                currency={l.currency}
                nights={quote.nights}
                compact
              />
              <p className="text-ink-500 mt-3 text-xs">
                Indicative until your contracted rates are applied. GST at the placeholder rate pending sign-off.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
