import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { GroupLabel, Panel, PanelHeading, PanelSection } from "@/components/ui/panel";
import { ScrubParams } from "@/components/ui/scrub-params";
import { Flash } from "@/components/requests/flash";
import { QuoteLines } from "@/components/requests/quote-lines";
import { StayCard } from "@/components/requests/stay-card";
import { getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
import { can } from "@/lib/domain/permissions";
import { parseSearchParams, searchQueryString } from "@/lib/domain/search";
import { priceStay } from "@/lib/listings/price";
import { loadOrgRules } from "@/lib/requests/submit";
import { fieldClasses, fieldErrorClass, labelClass } from "@/components/ui/field";

export const metadata = { title: "Request to book" };

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const int = (v: string | string[] | undefined, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(str(v), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const FIELD_LABELS: Record<string, string> = {
  guestName: "Guest name",
  guestEmail: "Guest email",
  claimRef: "Claim reference",
  poNumber: "PO number",
  acceptTerms: "Confirmation",
};

/** What to fix, next to the field itself, when the server sends the form back. */
const FIELD_HINTS: Record<string, string> = {
  guestName: "Enter the guest's name.",
  guestEmail: "Enter a valid email address, or leave it blank.",
  claimRef: "Your organisation requires a claim reference.",
  poNumber: "Your organisation requires a PO number.",
  acceptTerms: "Tick the confirmation to submit.",
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

  const [priced, org] = await Promise.all([
    priceStay(listingId, stay, { orgId: claims.org_id }),
    loadOrgRules(claims.org_id),
  ]);
  if (!priced) notFound();
  const l = priced.detail.listing;
  const back = `/listings/${listingId}${searchQueryString({ checkIn: stay.checkIn, checkOut: stay.checkOut, pets })}&adults=${adults}&children=${children}`;
  const errorFields = new Set(str(sp.fields).split(",").filter(Boolean));
  const quote = priced.availability.available ? priced.quote : null;

  return (
    <div className="space-y-6">
      <Link href={back} className="text-foreground inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to property
      </Link>
      <PageHeader
        eyebrow="Booking request"
        title="Request to book"
        description={`Submitting on behalf of ${org.name}.`}
      />

      {/* A validation bounce names its fields once, here, and again beside each field below. */}
      <Flash
        error={errorFields.size > 0 && str(sp.error) === "VALIDATION_FAILED" ? undefined : str(sp.error) || undefined}
        detail={str(sp.detail) || undefined}
        refCode={str(sp.ref) || undefined}
      />
      {errorFields.size > 0 && (
        <>
          {/* The field list and the typed values stay in the URL (they are the form's state); only the outcome goes. */}
          <ScrubParams keys={["error", "detail", "ref"]} />
          <Banner tone="error">
            Please check {[...errorFields].map((f) => FIELD_LABELS[f] ?? f).join(", ")}. Nothing has been submitted yet.
          </Banner>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8">
        <form method="post" action="/api/requests">
          <input type="hidden" name="listingId" value={listingId} />
          <input type="hidden" name="checkIn" value={stay.checkIn} />
          <input type="hidden" name="checkOut" value={stay.checkOut} />
          <input type="hidden" name="adults" value={adults} />
          <input type="hidden" name="children" value={children} />
          <input type="hidden" name="pets" value={pets} />
          <input type="hidden" name="priceHash" value={quote?.priceHash ?? ""} />

          <Panel flush className="divide-border divide-y">
            <PanelSection className="py-5">
              <GroupLabel className="mb-3">Guest</GroupLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Guest name <span className="text-accent-ink">*</span>
                  <input
                    name="guestName"
                    required
                    defaultValue={str(sp.guestName)}
                    aria-invalid={errorFields.has("guestName") || undefined}
                    className={fieldClasses(errorFields.has("guestName"))}
                    maxLength={120}
                    autoComplete="off"
                  />
                  {errorFields.has("guestName") && <span className={fieldErrorClass}>{FIELD_HINTS.guestName}</span>}
                </label>
                <label className={labelClass}>
                  Guest email
                  <input
                    name="guestEmail"
                    type="email"
                    defaultValue={str(sp.guestEmail)}
                    aria-invalid={errorFields.has("guestEmail") || undefined}
                    className={fieldClasses(errorFields.has("guestEmail"))}
                    autoComplete="off"
                  />
                  {errorFields.has("guestEmail") && <span className={fieldErrorClass}>{FIELD_HINTS.guestEmail}</span>}
                </label>
                <label className={labelClass}>
                  Guest phone
                  <input
                    name="guestPhone"
                    type="tel"
                    defaultValue={str(sp.guestPhone)}
                    className={fieldClasses()}
                    maxLength={40}
                    autoComplete="off"
                  />
                </label>
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                Guest details are shared with Live Luxe only for this stay.
              </p>
            </PanelSection>

            <PanelSection className="py-5">
              <GroupLabel className="mb-3">Your references</GroupLabel>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className={labelClass}>
                  Claim reference {org.require_claim_ref && <span className="text-accent-ink">*</span>}
                  <input
                    name="claimRef"
                    required={org.require_claim_ref}
                    defaultValue={str(sp.claimRef)}
                    aria-invalid={errorFields.has("claimRef") || undefined}
                    className={fieldClasses(errorFields.has("claimRef"))}
                    maxLength={60}
                  />
                  {errorFields.has("claimRef") && <span className={fieldErrorClass}>{FIELD_HINTS.claimRef}</span>}
                </label>
                <label className={labelClass}>
                  PO number {org.require_po_number && <span className="text-accent-ink">*</span>}
                  <input
                    name="poNumber"
                    required={org.require_po_number}
                    defaultValue={str(sp.poNumber) || (org.default_po_number ?? "")}
                    aria-invalid={errorFields.has("poNumber") || undefined}
                    className={fieldClasses(errorFields.has("poNumber"))}
                    maxLength={60}
                  />
                  {errorFields.has("poNumber") && <span className={fieldErrorClass}>{FIELD_HINTS.poNumber}</span>}
                </label>
                <label className={labelClass}>
                  Cost centre
                  <input
                    name="costCentre"
                    defaultValue={str(sp.costCentre) || (org.default_cost_centre ?? "")}
                    className={fieldClasses()}
                    maxLength={60}
                  />
                </label>
              </div>
              <label className={`${labelClass} mt-4`}>
                Notes for Live Luxe
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={str(sp.notes)}
                  className={fieldClasses()}
                  maxLength={2000}
                  placeholder="Access needs, arrival time, anything the team should know"
                />
              </label>
            </PanelSection>

            <PanelSection className="bg-muted/40 space-y-4 rounded-b-lg py-5">
              <label className="flex items-start gap-3 text-sm">
                <input
                  name="acceptTerms"
                  type="checkbox"
                  required
                  className="mt-0.5 h-4 w-4"
                  aria-invalid={errorFields.has("acceptTerms") || undefined}
                />
                <span className="text-foreground">
                  I confirm the stay details and the quoted total, and that this request is made under {org.name}&apos;s
                  agreement with Live Luxe. The dates are held for Live Luxe&apos;s decision; nothing is charged until
                  approval.
                  {errorFields.has("acceptTerms") && <span className={fieldErrorClass}>{FIELD_HINTS.acceptTerms}</span>}
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton variant="gold" className="w-full sm:w-auto" disabled={!quote} pendingLabel="Submitting…">
                  Submit request
                </SubmitButton>
                {quote && (
                  <span className="text-muted-foreground text-xs">
                    Live Luxe replies within the decision window; you can track it under Requests.
                  </span>
                )}
              </div>
              {!quote && (
                <p className="text-bad text-sm">
                  This stay can no longer be priced online for these dates. Go back and choose different dates.
                </p>
              )}
            </PanelSection>
          </Panel>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
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
            <Panel aria-labelledby="quote-heading">
              <PanelHeading id="quote-heading" title="Quote" className="mb-3" />
              <QuoteLines
                lines={quote.lines}
                totalCents={quote.totalCents}
                depositCents={quote.securityDepositCents}
                currency={l.currency}
                nights={quote.nights}
                compact
              />
              <p className="text-muted-foreground mt-3 text-xs">
                Indicative until your contracted rates are applied. GST at the placeholder rate pending sign-off.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
