import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { DecisionPanel } from "@/components/admin/decision-panel";
import { PaymentPanel } from "@/components/payments/payment-panel";
import { Banner } from "@/components/ui/banner";
import { PrintButton } from "@/components/ui/print-button";
import { GroupLabel, Panel, PanelHeading, PanelSection } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { Flash } from "@/components/requests/flash";
import { QuoteLines } from "@/components/requests/quote-lines";
import { StatusTimeline } from "@/components/requests/status-timeline";
import { StayCard } from "@/components/requests/stay-card";
import { humanizeDuration } from "@/lib/domain/dashboard";
import { todayIn } from "@/lib/domain/dates";
import { approvalPaymentGate, paymentModeFor } from "@/lib/domain/payments";
import { DECLINE_REASON_LABELS } from "@/lib/domain/requests";
import { orgPaymentTerms, paymentViewForBooking } from "@/lib/payments/load";
import { getRequest } from "@/lib/requests/load";
import { formatTimestamp } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/admin/bookings/[id]">) {
  const { id } = await params;
  const d = await getRequest(id);
  return { title: d ? `${d.request.reference} · Ops` : "Booking" };
}

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const BAND_TEXT = {
  on_track: "text-ok",
  at_risk: "text-warn",
  breached: "text-bad",
  paused: "text-foreground",
  none: "text-muted-foreground",
} as const;

/** Ops view of one request (§13.4): everything the partner sees plus org, SLA and the decision panel. */
export default async function AdminBookingPage({ params, searchParams }: PageProps<"/admin/bookings/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await getRequest(id);
  if (!d) notFound();
  const r = d.request;
  const [terms, pay] = await Promise.all([orgPaymentTerms(r.org_id), paymentViewForBooking(id)]);
  const mode = paymentModeFor(terms);
  const gate = approvalPaymentGate(mode, pay.state);
  const showPayment = !["DRAFT", "DECLINED", "EXPIRED", "CANCELLED", "FAILED"].includes(r.status);
  const now = new Date();
  const dueLeft = r.decision_due_at ? new Date(r.decision_due_at).getTime() - now.getTime() : null;
  const holdLeft = r.hold_expires_at ? new Date(r.hold_expires_at).getTime() - now.getTime() : null;

  return (
    <div className="space-y-6 print:space-y-4">
      <Link
        href="/admin/queue"
        className="text-foreground inline-flex items-center gap-1 text-sm hover:underline print:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Queue
      </Link>

      <p className="print-only text-muted-foreground hidden border-b pb-3 text-xs">
        Live Luxe · Operations · {d.org?.name ?? "Partner"} · {d.listing.name} · printed{" "}
        {formatTimestamp(new Date().toISOString())}
      </p>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">{d.org?.name ?? "Partner"}</p>
          <h1 className="text-strong font-serif text-3xl tracking-tight">{r.reference}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Submitted {r.submitted_at ? formatTimestamp(r.submitted_at) : "—"}
            {d.createdByName && ` by ${d.createdByName}`}
            {d.assignedToName && ` · assigned to ${d.assignedToName}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            <PrintButton />
            <StatusPill status={r.status} className="text-sm" />
          </div>
          {dueLeft !== null && ["SUBMITTED", "UNDER_REVIEW"].includes(r.status) && (
            <p className={cn("flex items-center gap-1 text-xs", BAND_TEXT[d.band])}>
              <Clock className="h-3 w-3" aria-hidden />
              {dueLeft < 0
                ? `Overdue by ${humanizeDuration(Math.abs(dueLeft))}`
                : `Decision due in ${humanizeDuration(dueLeft)}`}
            </p>
          )}
          {holdLeft !== null && holdLeft > 0 && (
            <p className="text-muted-foreground text-xs">Hold expires in {humanizeDuration(holdLeft)}</p>
          )}
        </div>
      </header>

      <div className="print:hidden">
        <Flash
          done={str(sp.done) || undefined}
          error={str(sp.error) || undefined}
          detail={str(sp.detail) || undefined}
          refCode={str(sp.ref) || undefined}
        />
      </div>

      {r.status === "DECLINED" && (
        <Banner tone="error">
          Declined: {DECLINE_REASON_LABELS[r.decline_reason ?? "other"]}
          {r.decline_notes && ` — ${r.decline_notes}`}
        </Banner>
      )}

      {showPayment && (
        <div className="print:hidden">
          <PaymentPanel
            audience="ops"
            bookingId={r.id}
            status={r.status}
            mode={mode}
            state={pay.state}
            payment={pay.row}
            invoice={pay.invoice}
            totalCents={r.total_cents}
            currency={r.currency}
          />
        </div>
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
            <GroupLabel className="mb-3">Partner and guest</GroupLabel>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">Organisation</dt>
                <dd className="text-strong">
                  {d.org?.name ?? "—"}
                  {r.payment_mode && (
                    <span className="text-muted-foreground block text-xs">Terms: {r.payment_mode}</span>
                  )}
                </dd>
              </div>
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
              <div>
                <dt className="text-muted-foreground text-xs">Hostaway listing</dt>
                <dd className="text-strong font-mono text-xs">{d.listing.hostawayListingId}</dd>
              </div>
              {r.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground text-xs">Partner notes</dt>
                  <dd className="text-foreground whitespace-pre-line">{r.notes}</dd>
                </div>
              )}
            </dl>
          </PanelSection>

          <PanelSection>
            <GroupLabel className="mb-3">Timeline</GroupLabel>
            <StatusTimeline history={d.history} showInternal />
          </PanelSection>
        </Panel>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start print:static">
          <div className="print:hidden">
            <DecisionPanel request={r} today={todayIn("Australia/Melbourne")} paymentGate={gate} />
          </div>
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
              <p className="text-muted-foreground text-sm">No quote stored.</p>
            )}
          </Panel>
        </aside>
      </div>

      <p className="print-only text-muted-foreground hidden border-t pt-3 text-xs">
        Live Luxe Pty Ltd · ABN 16 678 772 613 · Internal — contains partner and guest details.
      </p>
    </div>
  );
}
