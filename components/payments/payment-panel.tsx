import Link from "next/link";
import { CreditCard, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InvoiceRow, PaymentRow } from "@/lib/db/types";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import { formatMoney } from "@/lib/domain/money";
import {
  approvalPaymentGate,
  PAYABLE_STATUSES,
  PAYMENT_STATE_LABELS,
  type PaymentMode,
  type PaymentState,
} from "@/lib/domain/payments";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface PaymentPanelProps {
  audience: "partner" | "ops";
  bookingId: string;
  status: BookingStatus;
  mode: PaymentMode;
  state: PaymentState | null;
  payment: PaymentRow | null;
  invoice: InvoiceRow | null;
  totalCents: number | null;
  currency: string;
}

const cardLabel = (p: PaymentRow) =>
  p.card_last4
    ? `${p.card_brand ? p.card_brand[0].toUpperCase() + p.card_brand.slice(1) : "Card"} ending ${p.card_last4}`
    : "card";

/** One box that says where the money stands (§11), for the partner page and the ops page. */
export function PaymentPanel(p: PaymentPanelProps) {
  const payable = (PAYABLE_STATUSES as readonly string[]).includes(p.status) && p.totalCents != null;
  const needsCard = p.mode === "card_authorise" && p.state !== "authorised" && p.state !== "captured";
  const gate = approvalPaymentGate(p.mode, p.state);
  const tone =
    p.state === "captured" || p.state === "authorised" || p.mode === "invoice"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : p.state === "failed"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-gold-500 bg-white text-navy-900";

  return (
    <section aria-labelledby="payment-heading" className={cn("space-y-3 rounded-xl border p-5 text-sm", tone)}>
      <h2 id="payment-heading" className="flex items-center gap-2 font-serif text-xl">
        {p.mode === "invoice" ? (
          <FileText className="h-4 w-4" aria-hidden />
        ) : (
          <CreditCard className="h-4 w-4" aria-hidden />
        )}
        Payment
      </h2>

      {p.mode === "invoice" ? (
        <p>
          {p.audience === "partner" ? "Your organisation" : "This partner"} pays by invoice. No card is needed; the
          invoice is issued on approval.
        </p>
      ) : p.payment ? (
        <p>
          <strong>{PAYMENT_STATE_LABELS[p.state ?? "pending"]}</strong>
          {" · "}
          {cardLabel(p.payment)} ·{" "}
          {formatMoney(
            p.payment.amount_authorised_cents || p.payment.amount_captured_cents || p.totalCents || 0,
            p.currency,
          )}
          {p.state === "failed" && p.payment.failure_message && (
            <span className="block text-xs opacity-80">{p.payment.failure_message}</span>
          )}
          {p.state === "authorised" && p.audience === "partner" && (
            <span className="block text-xs opacity-80">
              Not charged yet. Live Luxe captures it on approval; if the request is declined or expires the hold is
              released automatically.
            </span>
          )}
        </p>
      ) : (
        <p>
          {p.audience === "partner"
            ? "No card hold yet. Live Luxe can only approve once a card is on file."
            : "No card hold yet."}
        </p>
      )}

      {p.invoice && (
        <p>
          Invoice <strong>{p.invoice.number ?? p.invoice.stripe_invoice_id}</strong> · {p.invoice.status}
          {p.invoice.due_at && ` · due ${formatDate(p.invoice.due_at.slice(0, 10))}`}
          {" · "}
          {p.invoice.hosted_url && (
            <a href={p.invoice.hosted_url} className="underline" target="_blank" rel="noreferrer">
              {p.invoice.status === "paid" ? "View invoice" : "Pay invoice"}
            </a>
          )}
          {p.invoice.pdf_url && (
            <>
              {" · "}
              <a href={p.invoice.pdf_url} className="underline">
                PDF
              </a>
            </>
          )}
        </p>
      )}

      {p.audience === "partner" && payable && needsCard && (
        <Button asChild variant="gold">
          <Link href={`/requests/${p.bookingId}/pay`}>
            {p.status === "AWAITING_PAYMENT"
              ? "Pay now"
              : p.state === "failed" || p.state === "requires_action"
                ? "Try another card"
                : "Secure with a card hold"}
          </Link>
        </Button>
      )}

      {p.audience === "ops" && !gate.ok && (PAYABLE_STATUSES as readonly string[]).includes(p.status) && (
        <p className="text-xs opacity-80">{gate.reason}</p>
      )}
    </section>
  );
}
