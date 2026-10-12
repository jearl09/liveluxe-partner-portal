import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PaymentForm } from "@/components/payments/payment-form";
import { Flash } from "@/components/requests/flash";
import { QuoteLines } from "@/components/requests/quote-lines";
import { getSessionClaims } from "@/lib/db/server";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/domain/money";
import { PAYABLE_STATUSES, paymentModeFor } from "@/lib/domain/payments";
import { can } from "@/lib/domain/permissions";
import { orgPaymentTerms, paymentViewForBooking } from "@/lib/payments/load";
import { getRequest } from "@/lib/requests/load";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Secure payment" };
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Card hold (mode A) or payment (after approval) for one request — spec §11.1. */
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={back} className="text-ink-700 inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to {r.reference}
      </Link>
      <header>
        <p className="eyebrow mb-1">{charging ? "Payment" : "Card hold"}</p>
        <h1 className="text-navy-900 font-serif text-3xl tracking-tight">
          {charging ? "Pay for your approved booking" : "Secure your request"}
        </h1>
        <p className="text-ink-700 mt-2 max-w-2xl text-sm">
          {charging
            ? "Live Luxe has approved this request. Paying now confirms the booking immediately."
            : "Live Luxe approves requests only once a card is on file. Nothing is charged until approval; a declined or expired request releases the hold automatically."}
        </p>
      </header>

      <Flash error={str(sp.error) || undefined} detail={str(sp.detail) || undefined} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="border-cream-200 rounded-xl border bg-white p-5">
          <h2 className="mb-1 flex items-center gap-2 font-serif text-xl">
            <ShieldCheck className="text-gold-600 h-4 w-4" aria-hidden /> Card details
          </h2>
          <p className="text-ink-500 mb-4 text-xs">
            Handled by Stripe. Live Luxe never sees or stores your card number.
          </p>
          <PaymentForm bookingId={id} returnUrl={`${env().NEXT_PUBLIC_APP_URL}/api/requests/${id}/pay/return`} />
        </section>

        <aside className="border-cream-200 h-fit rounded-xl border bg-white p-5">
          <h2 className="mb-1 font-serif text-xl">{d.listing.name}</h2>
          <p className="text-ink-500 mb-3 text-xs">
            {formatDate(r.check_in)} → {formatDate(r.check_out)} · {r.nights} nights
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
            <p className="text-navy-900 font-serif text-2xl">{formatMoney(r.total_cents, r.currency)}</p>
          )}
          <p className="text-ink-500 mt-3 text-xs">
            {charging ? "Charged now." : "Held now, charged on approval."} Reference {r.reference}.
          </p>
        </aside>
      </div>
    </div>
  );
}
