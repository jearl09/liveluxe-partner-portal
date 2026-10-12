import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Flash } from "@/components/requests/flash";
import { QuoteLines } from "@/components/requests/quote-lines";
import { StatusTimeline } from "@/components/requests/status-timeline";
import { StayCard } from "@/components/requests/stay-card";
import { getSessionClaims } from "@/lib/db/server";
import { humanizeDuration } from "@/lib/domain/dashboard";
import { formatMoney } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import { DECLINE_REASON_LABELS } from "@/lib/domain/requests";
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
  const now = new Date();
  const canAct = can(claims.role, "requests.submit");
  const counter = r.status === "COUNTER_OFFERED" ? d.history.filter((h) => h.to === "COUNTER_OFFERED").at(-1) : null;
  const holdLeft = r.hold_expires_at ? new Date(r.hold_expires_at).getTime() - now.getTime() : null;

  return (
    <div className="space-y-6">
      <Link href="/requests" className="text-ink-700 inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All requests
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Booking request</p>
          <h1 className="text-navy-900 font-serif text-3xl tracking-tight">{r.reference}</h1>
          <p className="text-ink-500 mt-1 text-sm">
            Submitted {r.submitted_at ? formatTimestamp(r.submitted_at) : "—"}
            {d.createdByName && ` by ${d.createdByName}`}
          </p>
        </div>
        <StatusPill status={r.status} className="text-sm" />
      </header>

      <Flash
        done={str(sp.submitted) ? "1" : str(sp.done) || undefined}
        error={str(sp.error) || undefined}
        refCode={str(sp.ref) || undefined}
      />

      {["SUBMITTED", "UNDER_REVIEW"].includes(r.status) && r.decision_due_at && (
        <p className="text-ink-700 bg-cream-50 border-cream-200 flex items-center gap-2 rounded-md border px-4 py-3 text-sm">
          <Clock className="text-gold-600 h-4 w-4 shrink-0" aria-hidden />
          Live Luxe is reviewing this. Decision due by {formatTimestamp(r.decision_due_at)}.
          {holdLeft !== null && holdLeft > 0 && ` Dates held for ${humanizeDuration(holdLeft)}.`}
        </p>
      )}

      {counter && (
        <section
          aria-labelledby="counter-heading"
          className="border-gold-500 space-y-3 rounded-xl border-2 bg-white p-5"
        >
          <h2 id="counter-heading" className="font-serif text-xl">
            Live Luxe proposed a change
          </h2>
          {typeof counter.metadata?.message === "string" && (
            <p className="text-ink-700 text-sm">“{counter.metadata.message}”</p>
          )}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {counter.metadata?.newCheckIn !== counter.metadata?.previousCheckIn ||
            counter.metadata?.newCheckOut !== counter.metadata?.previousCheckOut ? (
              <div>
                <dt className="text-ink-500 text-xs">Proposed dates</dt>
                <dd className="text-navy-900">
                  {formatDate(r.check_in)} → {formatDate(r.check_out)}
                  <span className="text-ink-500 block text-xs">
                    was {formatDate(String(counter.metadata?.previousCheckIn))} →{" "}
                    {formatDate(String(counter.metadata?.previousCheckOut))}
                  </span>
                </dd>
              </div>
            ) : null}
            {typeof counter.metadata?.newTotalCents === "number" &&
              counter.metadata.newTotalCents !== counter.metadata.previousTotalCents && (
                <div>
                  <dt className="text-ink-500 text-xs">Proposed total</dt>
                  <dd className="text-navy-900 font-serif text-xl">
                    {formatMoney(counter.metadata.newTotalCents, r.currency)}
                    {typeof counter.metadata.previousTotalCents === "number" && (
                      <span className="text-ink-500 block font-sans text-xs">
                        was {formatMoney(counter.metadata.previousTotalCents, r.currency)}
                      </span>
                    )}
                  </dd>
                </div>
              )}
          </dl>
          {holdLeft !== null && holdLeft > 0 && (
            <p className="text-ink-500 text-xs">
              Please answer within {humanizeDuration(holdLeft)}; the dates are held until then.
            </p>
          )}
          {canAct && (
            <div className="flex flex-wrap gap-2">
              <form method="post" action={`/api/requests/${r.id}/counter`}>
                <input type="hidden" name="action" value="accept" />
                <Button type="submit" variant="gold">
                  Accept the proposal
                </Button>
              </form>
              <form method="post" action={`/api/requests/${r.id}/counter`}>
                <input type="hidden" name="action" value="decline" />
                <Button type="submit" variant="outline">
                  Decline and close
                </Button>
              </form>
            </div>
          )}
        </section>
      )}

      {r.status === "DECLINED" && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          <p className="font-medium">Live Luxe declined this request</p>
          <p className="mt-1">
            {DECLINE_REASON_LABELS[r.decline_reason ?? "other"] ?? "Other"}
            {r.decline_notes && ` — ${r.decline_notes}`}
          </p>
          <p className="mt-2 text-xs">The dates have been released. You can search again for alternatives.</p>
        </section>
      )}

      {r.status === "APPROVED" && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p className="font-medium">Approved</p>
          <p className="mt-1">
            The dates are reserved. Payment and confirmation follow next; check-in details are released 48 hours before
            arrival.
          </p>
        </section>
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
            <h2 className="mb-3 font-serif text-xl">Details</h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
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
              {r.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-ink-500 text-xs">Notes</dt>
                  <dd className="text-ink-700 whitespace-pre-line">{r.notes}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="border-cream-200 rounded-xl border bg-white p-5">
            <h2 className="mb-3 font-serif text-xl">Timeline</h2>
            <StatusTimeline history={d.history} />
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="border-cream-200 rounded-xl border bg-white p-5">
            <h2 className="mb-3 font-serif text-xl">Quote</h2>
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
              <p className="text-ink-500 text-sm">Priced by Live Luxe.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
