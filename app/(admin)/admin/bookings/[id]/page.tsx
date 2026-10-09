import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { DecisionPanel } from "@/components/admin/decision-panel";
import { StatusPill } from "@/components/ui/status-pill";
import { Flash } from "@/components/requests/flash";
import { QuoteLines } from "@/components/requests/quote-lines";
import { StatusTimeline } from "@/components/requests/status-timeline";
import { StayCard } from "@/components/requests/stay-card";
import { humanizeDuration } from "@/lib/domain/dashboard";
import { todayIn } from "@/lib/domain/dates";
import { DECLINE_REASON_LABELS } from "@/lib/domain/requests";
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
  on_track: "text-emerald-800",
  at_risk: "text-amber-800",
  breached: "text-red-800",
  paused: "text-ink-700",
  none: "text-ink-500",
} as const;

/** Ops view of one request (§13.4): everything the partner sees plus org, SLA and the decision panel. */
export default async function AdminBookingPage({ params, searchParams }: PageProps<"/admin/bookings/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await getRequest(id);
  if (!d) notFound();
  const r = d.request;
  const now = new Date();
  const dueLeft = r.decision_due_at ? new Date(r.decision_due_at).getTime() - now.getTime() : null;
  const holdLeft = r.hold_expires_at ? new Date(r.hold_expires_at).getTime() - now.getTime() : null;

  return (
    <div className="space-y-6">
      <Link href="/admin/queue" className="text-ink-700 inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Queue
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">{d.org?.name ?? "Partner"}</p>
          <h1 className="text-navy-900 font-serif text-3xl tracking-tight">{r.reference}</h1>
          <p className="text-ink-500 mt-1 text-sm">
            Submitted {r.submitted_at ? formatTimestamp(r.submitted_at) : "—"}
            {d.createdByName && ` by ${d.createdByName}`}
            {d.assignedToName && ` · assigned to ${d.assignedToName}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusPill status={r.status} className="text-sm" />
          {dueLeft !== null && ["SUBMITTED", "UNDER_REVIEW"].includes(r.status) && (
            <p className={cn("flex items-center gap-1 text-xs", BAND_TEXT[d.band])}>
              <Clock className="h-3 w-3" aria-hidden />
              {dueLeft < 0
                ? `Overdue by ${humanizeDuration(Math.abs(dueLeft))}`
                : `Decision due in ${humanizeDuration(dueLeft)}`}
            </p>
          )}
          {holdLeft !== null && holdLeft > 0 && (
            <p className="text-ink-500 text-xs">Hold expires in {humanizeDuration(holdLeft)}</p>
          )}
        </div>
      </header>

      <Flash
        done={str(sp.done) || undefined}
        error={str(sp.error) || undefined}
        detail={str(sp.detail) || undefined}
        refCode={str(sp.ref) || undefined}
      />

      {r.status === "DECLINED" && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Declined: {DECLINE_REASON_LABELS[r.decline_reason ?? "other"]}
          {r.decline_notes && ` — ${r.decline_notes}`}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <StayCard
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

          <section className="border-cream-200 rounded-xl border bg-white p-5">
            <h2 className="mb-3 font-serif text-lg">Partner details</h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-500 text-xs">Organisation</dt>
                <dd className="text-navy-900">
                  {d.org?.name ?? "—"}
                  {r.payment_mode && <span className="text-ink-500 block text-xs">Terms: {r.payment_mode}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">Guest</dt>
                <dd className="text-navy-900">
                  {r.guest_name ?? "—"}
                  {(r.guest_email || r.guest_phone) && (
                    <span className="text-ink-500 block text-xs">
                      {[r.guest_email, r.guest_phone].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">References</dt>
                <dd className="text-navy-900 font-mono text-xs">
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
                <dt className="text-ink-500 text-xs">Hostaway listing</dt>
                <dd className="text-navy-900 font-mono text-xs">{d.listing.hostawayListingId}</dd>
              </div>
              {r.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-ink-500 text-xs">Partner notes</dt>
                  <dd className="text-ink-700 whitespace-pre-line">{r.notes}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="border-cream-200 rounded-xl border bg-white p-5">
            <h2 className="mb-3 font-serif text-lg">Quote</h2>
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
              <p className="text-ink-500 text-sm">No quote stored.</p>
            )}
          </section>

          <section className="border-cream-200 rounded-xl border bg-white p-5">
            <h2 className="mb-3 font-serif text-lg">Timeline</h2>
            <StatusTimeline history={d.history} showInternal />
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <DecisionPanel request={r} today={todayIn("Australia/Melbourne")} />
        </aside>
      </div>
    </div>
  );
}
