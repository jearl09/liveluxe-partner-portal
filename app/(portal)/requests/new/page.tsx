import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ScrubParams } from "@/components/ui/scrub-params";
import { Flash } from "@/components/requests/flash";
import { QuoteLines } from "@/components/requests/quote-lines";
import { RequestForm } from "@/components/requests/request-form";
import { StayCard } from "@/components/requests/stay-card";
import { getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
import { PAY_MODE_SENTENCE, paymentModeFor } from "@/lib/domain/payments";
import { can } from "@/lib/domain/permissions";
import { displayPropertyName } from "@/lib/domain/property-name";
import { parseSearchParams, searchQueryString } from "@/lib/domain/search";
import { env } from "@/lib/env";
import { priceStay } from "@/lib/listings/price";
import { orgPaymentTerms } from "@/lib/payments/load";
import { loadOrgRules } from "@/lib/requests/submit";
import { cn } from "@/lib/utils";

export const metadata = { title: "Request this property" };

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const int = (v: string | string[] | undefined, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(str(v), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const FIELD_LABELS: Record<string, string> = {
  guestName: "guest name",
  guestEmail: "guest email",
  claimRef: "claim reference",
  poNumber: "PO number",
  acceptTerms: "confirmation",
};

/**
 * New request (brief §7.5): what do you need from me to send this. Two steps on one
 * page, guest and references then review and send, beside the stay and the quote.
 * The quote is re-priced here and again on submit; the price hash travels with the
 * form so a changed price is caught, never silently applied. Card-paying partners go
 * on to the card hold as the last step.
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

  const [priced, org, terms] = await Promise.all([
    priceStay(listingId, stay, { orgId: claims.org_id }),
    loadOrgRules(claims.org_id),
    orgPaymentTerms(claims.org_id),
  ]);
  if (!priced) notFound();
  const l = priced.detail.listing;
  const name = displayPropertyName(l.public_name);
  const mode = paymentModeFor(terms);
  const propertyHref = `/listings/${listingId}${searchQueryString({ checkIn: stay.checkIn, checkOut: stay.checkOut, pets })}&adults=${adults}&children=${children}#price`;
  const searchHref = `/search${searchQueryString({ q: l.suburb ?? "", checkIn: stay.checkIn, checkOut: stay.checkOut, guests: adults + children, pets, page: 1 })}`;
  const errorFields = str(sp.fields).split(",").filter(Boolean);
  const error = str(sp.error);
  const quote = priced.availability.available ? priced.quote : null;
  const datesGone = error === "DATES_UNAVAILABLE" || error === "DATES_HELD" || !priced.availability.available;

  const review = (
    <div className="space-y-4">
      <StayCard
        listing={{ name, suburb: l.suburb, state: l.state, imageUrl: priced.detail.images[0]?.url ?? null }}
        checkIn={stay.checkIn}
        checkOut={stay.checkOut}
        nights={priced.availability.nights}
        adults={adults}
        childGuests={children}
        pets={pets}
      />
      {quote && (
        <section aria-labelledby="quote-heading" className="border-subtle bg-surface rounded-card border p-5">
          <h2 id="quote-heading" className="mb-3">
            Quote
          </h2>
          <QuoteLines
            lines={quote.lines}
            totalCents={quote.totalCents}
            depositCents={quote.securityDepositCents}
            currency={l.currency}
            nights={quote.nights}
            compact
          />
          <p className="text-text-muted text-body-sm mt-3">
            Your contracted rates are applied when you send it. GST is shown at the standard rate until Live Luxe&apos;s
            accountant confirms the treatment of long stays.
          </p>
        </section>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Link
        href={propertyHref}
        className="text-text-secondary hover:text-text-primary text-body-sm inline-flex items-center gap-1 font-semibold"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the property
      </Link>
      <header>
        <h1 className="text-h1 text-text-primary font-serif tracking-tight">Request this property</h1>
        <p className="text-text-secondary mt-1">
          {name} · for {org.name}
        </p>
      </header>

      {datesGone ? (
        <div role="alert" className="border-danger-border bg-danger-bg rounded-card border px-5 py-4">
          <p className="text-danger-fg font-semibold">These dates are no longer free at this property.</p>
          <p className="text-text-primary mt-1">
            Someone booked them since you searched. Nothing has been sent and nothing is charged. What you typed is kept
            in this browser for your next request.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link href={propertyHref} className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
              Pick other dates here
            </Link>
            <Link href={searchHref} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
              See what else is free
            </Link>
            <a
              href={`mailto:${env().EMAIL_REPLY_TO}?subject=${encodeURIComponent(`Find a property: ${l.suburb ?? ""} ${stay.checkIn} to ${stay.checkOut}`)}`}
              className={cn(buttonVariants({ variant: "tertiary", size: "sm" }))}
            >
              Ask Live Luxe to find one
            </a>
          </div>
        </div>
      ) : (
        <>
          <Flash
            error={errorFields.length > 0 && error === "VALIDATION_FAILED" ? undefined : error || undefined}
            detail={str(sp.detail) || undefined}
            refCode={str(sp.ref) || undefined}
          />
          {errorFields.length > 0 && (
            <>
              <ScrubParams keys={["error", "detail", "ref"]} />
              <p
                role="alert"
                className="border-danger-border bg-danger-bg text-danger-fg rounded-card border px-4 py-3"
              >
                Please check the {errorFields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}. Nothing has been sent yet,
                and everything you typed is still here.
              </p>
            </>
          )}
        </>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <RequestForm
          hidden={{
            listingId,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            adults: String(adults),
            children: String(children),
            pets: String(pets),
            priceHash: quote?.priceHash ?? "",
            // §17.2 duplicate submission: a double-click or browser retry returns the first result.
            submissionKey: randomUUID(),
          }}
          values={{
            guestName: str(sp.guestName),
            guestEmail: str(sp.guestEmail),
            guestPhone: str(sp.guestPhone),
            claimRef: str(sp.claimRef),
            poNumber: str(sp.poNumber) || (org.default_po_number ?? ""),
            costCentre: str(sp.costCentre) || (org.default_cost_centre ?? ""),
            notes: str(sp.notes),
            acceptTerms: str(sp.acceptTerms),
          }}
          errorFields={errorFields}
          rules={{ claimRequired: org.require_claim_ref, poRequired: org.require_po_number }}
          orgName={org.name}
          canSend={!!quote && !datesGone}
          withCard={mode !== "invoice"}
          payLine={PAY_MODE_SENTENCE[mode]}
          draftKey={`llx:request-draft:${claims.org_id}`}
          review={review}
        />
        <aside className="hidden lg:sticky lg:top-20 lg:block">{review}</aside>
      </div>
    </div>
  );
}
