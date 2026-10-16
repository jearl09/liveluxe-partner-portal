import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PaymentForm } from "@/components/payments/payment-form";
import { Flash } from "@/components/requests/flash";
import { FlowSteps } from "@/components/requests/flow-steps";
import { QuoteLines } from "@/components/requests/quote-lines";
import { getSessionClaims } from "@/lib/db/server";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/domain/money";
import { PAYABLE_STATUSES, paymentModeFor } from "@/lib/domain/payments";
import { can } from "@/lib/domain/permissions";
import { partnerPropertyName } from "@/lib/domain/property-name";
import { orgPaymentTerms, paymentViewForBooking } from "@/lib/payments/load";
import { getRequest } from "@/lib/requests/load";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Authorise your card" };
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Card hold before a decision, or payment after approval (spec §11.1). Reached straight
 * from submitting (`?flow=1`) it is the last step of the request flow (brief §7.5) and
 * says so; the request already exists, so leaving now loses nothing.
 */
export default async function PayPage({ params, searchParams }: PageProps<"/requests/[id]/pay">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await getRequest(id);
  if (!d) notFound();
  const r = d.request;
  const back = `/requests/${id}`;

  if (!can(claims.role, "payments.authorise")) redirect(`${back}?error=FORBIDDEN`);
  if (!(PAYABLE_STATUSES as readonly string[]).includes(r.status) || r.total_cents == null) redirect(back);
  const [terms, view] = await Promise.all([orgPaymentTerms(r.org_id), paymentViewForBooking(id)]);
  if (paymentModeFor(terms) === "invoice") redirect(back);
  if (view.state === "authorised") redirect(`${back}?done=card_held`);
  if (view.state === "captured") redirect(`${back}?done=paid`);

  const charging = r.status === "AWAITING_PAYMENT";
  const inFlow = str(sp.flow) === "1" && !charging;
  const name = partnerPropertyName(d.listing.name, d.listing.internalName);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {!inFlow && (
        <Link
          href={back}
          className="text-text-secondary hover:text-text-primary text-body-sm inline-flex items-center gap-1 font-semibold"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to {r.reference}
        </Link>
      )}
      {inFlow && <FlowSteps current={2} withCard />}

      <header className="space-y-2">
        {inFlow && (
          <p className="text-success-fg font-semibold">
            Request {r.reference} is sent. One more step so Live Luxe can decide.
          </p>
        )}
        <h1 className="text-h1 text-text-primary font-serif tracking-tight">
          {charging ? "Pay for your approved booking" : "Authorise your card"}
        </h1>
        <p className="text-text-secondary max-w-2xl">
          {charging
            ? "Live Luxe has approved this request. Paying now confirms the booking straight away."
            : "Live Luxe approves a request only once a card is held. Nothing is charged unless it is approved, and a declined or expired request releases the hold."}
        </p>
      </header>

      <Flash error={str(sp.error) || undefined} detail={str(sp.detail) || undefined} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="border-subtle bg-surface rounded-card border p-5">
          <h2 className="flex items-center gap-2">
            <ShieldCheck className="text-text-gold h-5 w-5" aria-hidden /> Card details
          </h2>
          <p className="text-text-muted text-body-sm mt-1 mb-4">
            Handled by Stripe. Live Luxe never sees or stores your card number.
          </p>
          <PaymentForm bookingId={id} returnUrl={`${env().NEXT_PUBLIC_APP_URL}/api/requests/${id}/pay/return`} />
          {inFlow && (
            <p className="text-text-secondary text-body-sm border-subtle mt-5 border-t pt-4">
              Not now?{" "}
              <Link href={back} className="text-text-primary font-semibold underline underline-offset-4">
                Hold it later from the request
              </Link>
              . Your dashboard will remind you, and Live Luxe will wait.
            </p>
          )}
        </section>

        <aside className="border-subtle bg-surface rounded-card h-fit border p-5">
          <p className="text-text-muted text-body-sm font-mono">{r.reference}</p>
          <h2 className="mt-1">{name}</h2>
          <p className="text-text-secondary text-body-sm mt-1 mb-3">
            {formatDate(r.check_in)} → {formatDate(r.check_out)} · {r.nights} {r.nights === 1 ? "night" : "nights"}
          </p>
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
            <p className="text-text-primary text-h2 font-serif">{formatMoney(r.total_cents, r.currency)}</p>
          )}
          <p className="text-text-primary text-body-sm mt-3 font-semibold">
            {charging ? "Charged now." : "Held now, charged only on approval."}
          </p>
        </aside>
      </div>
    </div>
  );
}
