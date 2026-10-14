import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { PrintButton } from "@/components/ui/print-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { GroupLabel, Panel, PanelHeading, PanelSection } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { PaymentPanel } from "@/components/payments/payment-panel";
import { CancelPanel } from "@/components/requests/cancel-panel";
import { CheckinPanel } from "@/components/requests/checkin-panel";
import { Flash } from "@/components/requests/flash";
import { QuoteLines } from "@/components/requests/quote-lines";
import { StatusTimeline } from "@/components/requests/status-timeline";
import { StayCard } from "@/components/requests/stay-card";
import { getSessionClaims } from "@/lib/db/server";
import { env } from "@/lib/env";
import { humanizeDuration } from "@/lib/domain/dashboard";
import { formatMoney } from "@/lib/domain/money";
import { paymentModeFor } from "@/lib/domain/payments";
import { can } from "@/lib/domain/permissions";
import { DECLINE_REASON_LABELS } from "@/lib/domain/requests";
import { orgPaymentTerms, paymentViewForBooking } from "@/lib/payments/load";
import { cancellationView } from "@/lib/requests/cancel";
import { checkinView, recordCheckinAccess } from "@/lib/requests/checkin";
import { getRequest } from "@/lib/requests/load";
import { formatDate, formatTimestamp } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/requests/[id]">) {
  const { id } = await params;
  const d = await getRequest(id);
  return { title: d?.request.reference ?? "Request" };
}

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Partner's view of one request (§13.3): status, stay, quote, counter-offer actions, timeline. */
export default async function RequestPage({ params, searchParams }: PageProps<"/requests/[id]">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const d = await getRequest(id);
  if (!d) notFound();
  const r = d.request;
  const [terms, pay, cancel, checkin] = await Promise.all([
    orgPaymentTerms(r.org_id),
    paymentViewForBooking(id),
    cancellationView(d),
    checkinView(r),
  ]);
  if (checkin.tier === "full") {
    // §8.4: every view of a released pack is logged with user, time and IP.
    const h = await headers();
    await recordCheckinAccess({
      bookingId: r.id,
      claims,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    });
  }
  const mode = paymentModeFor(terms);
  const showPayment = !["DRAFT", "DECLINED", "EXPIRED", "FAILED", "COUNTER_OFFERED"].includes(r.status);
  const now = new Date();
  const canAct = can(claims.role, "requests.submit");
  const canCancel = can(claims.role, "requests.cancel");
  const counter = r.status === "COUNTER_OFFERED" ? d.history.filter((h) => h.to === "COUNTER_OFFERED").at(-1) : null;
  const holdLeft = r.hold_expires_at ? new Date(r.hold_expires_at).getTime() - now.getTime() : null;

  return (
    <div className="space-y-6 print:space-y-4">
      <Link
        href="/requests"
        className="text-foreground inline-flex items-center gap-1 text-sm hover:underline print:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All requests
      </Link>

      {/* Paper gets the letterhead the app chrome provides on screen. */}
      <p className="print-only text-muted-foreground hidden border-b pb-3 text-xs">
        Live Luxe · Partner booking request · {d.listing.name} · printed {formatTimestamp(new Date().toISOString())}
      </p>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Booking request</p>
          <h1 className="text-strong font-serif text-3xl tracking-tight">{r.reference}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Submitted {r.submitted_at ? formatTimestamp(r.submitted_at) : "—"}
            {d.createdByName && ` by ${d.createdByName}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PrintButton />
          <StatusPill status={r.status} className="text-sm" />
        </div>
      </header>

      <div className="print:hidden">
        <Flash
          done={str(sp.submitted) ? "1" : str(sp.done) || undefined}
          error={str(sp.error) || undefined}
          detail={str(sp.detail) || undefined}
          refCode={str(sp.ref) || undefined}
        />
      </div>

      {["SUBMITTED", "UNDER_REVIEW"].includes(r.status) && r.decision_due_at && (
        <Banner tone="info">
          Live Luxe is reviewing this. Decision due by {formatTimestamp(r.decision_due_at)}.
          {holdLeft !== null && holdLeft > 0 && ` Dates held for ${humanizeDuration(holdLeft)}.`}
        </Banner>
      )}

      {counter && (
        <Panel aria-labelledby="counter-heading" className="border-accent space-y-3">
          <PanelHeading
            id="counter-heading"
            title="Live Luxe proposed a change"
            description="Accept it to keep the dates on the new terms, or decline to close the request."
            className="mb-1"
          />
          {typeof counter.metadata?.message === "string" && (
            <p className="text-foreground text-sm">“{counter.metadata.message}”</p>
          )}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {counter.metadata?.newCheckIn !== counter.metadata?.previousCheckIn ||
            counter.metadata?.newCheckOut !== counter.metadata?.previousCheckOut ? (
              <div>
                <dt className="text-muted-foreground text-xs">Proposed dates</dt>
                <dd className="text-strong">
                  {formatDate(r.check_in)} → {formatDate(r.check_out)}
                  <span className="text-muted-foreground block text-xs">
                    was {formatDate(String(counter.metadata?.previousCheckIn))} →{" "}
                    {formatDate(String(counter.metadata?.previousCheckOut))}
                  </span>
                </dd>
              </div>
            ) : null}
            {typeof counter.metadata?.newTotalCents === "number" &&
              counter.metadata.newTotalCents !== counter.metadata.previousTotalCents && (
                <div>
                  <dt className="text-muted-foreground text-xs">Proposed total</dt>
                  <dd className="text-strong font-serif text-xl">
                    {formatMoney(counter.metadata.newTotalCents, r.currency)}
                    {typeof counter.metadata.previousTotalCents === "number" && (
                      <span className="text-muted-foreground block font-sans text-xs">
                        was {formatMoney(counter.metadata.previousTotalCents, r.currency)}
                      </span>
                    )}
                  </dd>
                </div>
              )}
          </dl>
          {holdLeft !== null && holdLeft > 0 && (
            <p className="text-muted-foreground text-xs">
              Please answer within {humanizeDuration(holdLeft)}; the dates are held until then.
            </p>
          )}
          {canAct && (
            <div className="flex flex-wrap gap-2 pt-1 print:hidden">
              <form method="post" action={`/api/requests/${r.id}/counter`}>
                <input type="hidden" name="action" value="accept" />
                <SubmitButton variant="gold" pendingLabel="Accepting…">
                  Accept the proposal
                </SubmitButton>
              </form>
              <form method="post" action={`/api/requests/${r.id}/counter`}>
                <input type="hidden" name="action" value="decline" />
                <SubmitButton variant="outline" pendingLabel="Closing…">
                  Decline and close
                </SubmitButton>
              </form>
            </div>
          )}
        </Panel>
      )}

      {r.status === "DECLINED" && (
        <Banner tone="error">
          <p className="font-medium">Live Luxe declined this request</p>
          <p>
            {DECLINE_REASON_LABELS[r.decline_reason ?? "other"] ?? "Other"}
            {r.decline_notes && ` — ${r.decline_notes}`}
          </p>
          <p className="text-xs">The dates have been released. You can search again for alternatives.</p>
        </Banner>
      )}

      {r.status === "CANCELLED" && (
        <Banner tone="warn">
          <p className="font-medium">Cancelled{r.cancelled_at && ` ${formatTimestamp(r.cancelled_at)}`}</p>
          {r.cancellation_reason && <p>{r.cancellation_reason}</p>}
          {(r.cancel_refund_cents != null || r.cancel_retained_cents != null) && (
            <p className="text-xs">
              Refund {formatMoney(r.cancel_refund_cents ?? 0, r.currency)} · retained{" "}
              {formatMoney(r.cancel_retained_cents ?? 0, r.currency)} under the cancellation policy.
            </p>
          )}
        </Banner>
      )}

      {r.status === "APPROVED" && (
        <Banner tone="success">
          <p className="font-medium">Approved</p>
          <p>
            The dates are reserved. {mode === "invoice" ? "Your invoice is being issued" : "Payment is being finalised"}{" "}
            and the booking confirms automatically in a moment.
          </p>
        </Banner>
      )}

      {r.status === "AWAITING_PAYMENT" && (
        <Banner tone="info">
          <p className="font-medium">Approved: payment needed to confirm</p>
          <p>
            Live Luxe approved this request but the card could not be charged. Pay below to confirm the booking.
            {holdLeft !== null && holdLeft > 0 && ` The dates stay reserved for ${humanizeDuration(holdLeft)}.`}
          </p>
        </Banner>
      )}

      {(r.status === "CONFIRMED" || r.status === "CHECKED_IN" || r.status === "COMPLETED") && (
        <Banner tone="success">
          <p className="font-medium">Confirmed</p>
          <p>
            The booking is locked in.{" "}
            {checkin.tier === "full"
              ? "The access pack is below."
              : "Door code and Wi-Fi appear below once the access pack is released."}{" "}
            Your tax invoice is under Invoices.
          </p>
        </Banner>
      )}

      <CheckinPanel audience="partner" request={r} view={checkin} supportEmail={env().EMAIL_REPLY_TO} />

      {showPayment && (
        <div className="print:hidden">
          <PaymentPanel
            audience="partner"
            bookingId={r.id}
            status={r.status}
            mode={mode}
            state={pay.state}
            payment={pay.row}
            invoice={pay.invoice}
            refunds={pay.refunds}
            totalCents={r.total_cents}
            currency={r.currency}
          />
        </div>
      )}

      {canCancel && cancel.quote && (
        <CancelPanel audience="partner" request={r} quote={cancel.quote} cutoffDays={cancel.policy.cutoffDays} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8 print:grid-cols-1 print:gap-4">
        <Panel flush className="divide-border divide-y" aria-label="Request details">
          <PanelSection className="py-4">
            <StayCard
              plain
              listing={{
                name: d.listing.name,
                suburb: d.listing.suburb,
                state: d.listing.state,
                imageUrl: d.listing.imageUrl,
              }}
              checkIn={r.check_in}
              checkOut={r.check_out}
              nights={r.nights}
              adults={r.guests_adults}
              childGuests={r.guests_children}
              pets={r.guests_pets}
            />
          </PanelSection>

          <PanelSection>
            <GroupLabel className="mb-3">Guest and references</GroupLabel>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">Guest</dt>
                <dd className="text-strong">
                  {r.guest_name ?? "—"}
                  {(r.guest_email || r.guest_phone) && (
                    <span className="text-muted-foreground block text-xs">
                      {[r.guest_email, r.guest_phone].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">References</dt>
                <dd className="text-strong font-mono text-xs">
                  {[
                    r.claim_ref && `Claim ${r.claim_ref}`,
                    r.po_number && `PO ${r.po_number}`,
                    r.cost_centre && `CC ${r.cost_centre}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
              {r.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground text-xs">Notes</dt>
                  <dd className="text-foreground whitespace-pre-line">{r.notes}</dd>
                </div>
              )}
            </dl>
          </PanelSection>

          <PanelSection>
            <GroupLabel className="mb-3">Timeline</GroupLabel>
            <StatusTimeline history={d.history} />
          </PanelSection>
        </Panel>

        <aside className="lg:sticky lg:top-20 lg:self-start print:static">
          <Panel aria-labelledby="quote-heading" className="print-keep">
            <PanelHeading id="quote-heading" title="Quote" className="mb-3" />
            {d.quote ? (
              <QuoteLines
                lines={d.quote.lines}
                totalCents={d.quote.totalCents}
                depositCents={d.quote.depositCents}
                currency={d.quote.currency}
                nights={r.nights}
                compact
              />
            ) : (
              <p className="text-muted-foreground text-sm">Priced by Live Luxe.</p>
            )}
          </Panel>
        </aside>
      </div>

      <p className="print-only text-muted-foreground hidden border-t pt-3 text-xs">
        Live Luxe Pty Ltd · ABN 16 678 772 613 · Partner bookings are confidential and subject to your agreement with
        Live Luxe.
      </p>
    </div>
  );
}
