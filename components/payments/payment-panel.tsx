import { CreditCard, FileText } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { HelpTip } from "@/components/ui/help-tip";
import type { InvoiceRow, PaymentRow, RefundRow } from "@/lib/db/types";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";
import { formatMoney } from "@/lib/domain/money";
import { PAYMENT_STATE_LABELS, type PaymentMode, type PaymentState } from "@/lib/domain/payments";
import { formatDate } from "@/lib/utils";

export interface PaymentPanelProps {
  audience: "partner" | "ops";
  status: BookingStatus;
  mode: PaymentMode;
  state: PaymentState | null;
  payment: PaymentRow | null;
  invoice: InvoiceRow | null;
  refunds?: RefundRow[];
  totalCents: number | null;
  currency: string;
}

const cardLabel = (p: PaymentRow) =>
  p.card_last4
    ? `${p.card_brand ? p.card_brand[0].toUpperCase() + p.card_brand.slice(1) : "Card"} ••${p.card_last4}`
    : "card";

const MODE_WORDS: Record<PaymentMode, { partner: string; ops: string }> = {
  card_authorise: {
    partner: "Your card is held when you request and charged only if Live Luxe approves.",
    ops: "Card: held at request, charged on approval.",
  },
  deposit: {
    partner: "A deposit is charged when Live Luxe approves; the balance is invoiced before check-in.",
    ops: "Deposit: charged on approval, balance invoiced before check-in.",
  },
  invoice: {
    partner: "Your organisation pays by invoice. Nothing is charged to a card.",
    ops: "Invoice terms. No card.",
  },
};

const INVOICE_STATUS: Record<
  string,
  { label: string; tone: "success" | "attention" | "danger" | "muted" | "neutral" }
> = {
  paid: { label: "Paid", tone: "success" },
  open: { label: "Due", tone: "attention" },
  uncollectible: { label: "Overdue", tone: "danger" },
  void: { label: "Void", tone: "muted" },
  draft: { label: "Draft", tone: "neutral" },
};

/**
 * Where the money stands (brief §8.5): the payment mode in plain words, what has
 * happened (held / charged / invoiced / refunded) with amounts and dates, and the
 * invoice. Facts only — the Pay action lives in the action panel so there is one
 * primary per view. Renders what the server returns; recomputes nothing.
 */
export function PaymentPanel(p: PaymentPanelProps) {
  const refunded = (p.refunds ?? []).filter((r) => r.status === "succeeded").reduce((s, r) => s + r.amount_cents, 0);
  const captured = p.payment?.amount_captured_cents ?? 0;
  const net = captured > 0 && refunded >= captured ? "refunded" : null;
  return (
    <section aria-labelledby="payment-heading" className="bg-surface border-subtle rounded-card print-keep border p-5">
      <h2 id="payment-heading" className="flex items-center gap-2">
        {p.mode === "invoice" ? (
          <FileText className="text-text-muted h-4 w-4" aria-hidden />
        ) : (
          <CreditCard className="text-text-muted h-4 w-4" aria-hidden />
        )}
        Payment
      </h2>
      <p className="text-text-secondary mt-1 flex items-start gap-1">
        <span>{MODE_WORDS[p.mode][p.audience]}</span>
        {p.audience === "partner" && p.mode !== "invoice" && (
          <HelpTip label="What is a card hold?">
            A hold reserves the amount on the card so the dates are yours while Live Luxe reviews. If the request is
            declined or expires, the hold drops off by itself and nothing is charged.
          </HelpTip>
        )}
      </p>

      <dl className="divide-subtle text-body mt-3 divide-y">
        {p.payment && (
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <dt className="text-text-secondary">{cardLabel(p.payment)}</dt>
            <dd className="flex items-center gap-2">
              <span className="text-text-primary tabular-nums">
                {formatMoney(
                  p.payment.amount_captured_cents || p.payment.amount_authorised_cents || p.totalCents || 0,
                  p.currency,
                )}
              </span>
              <Pill
                tone={
                  net
                    ? "muted"
                    : p.state === "captured"
                      ? "success"
                      : p.state === "authorised"
                        ? "info"
                        : p.state === "failed"
                          ? "danger"
                          : "attention"
                }
              >
                {net ? "Refunded" : PAYMENT_STATE_LABELS[p.state ?? "pending"]}
              </Pill>
            </dd>
          </div>
        )}
        {p.payment?.failure_message && p.state === "failed" && (
          <p className="text-danger-fg text-body-sm py-2">{p.payment.failure_message}</p>
        )}
        {!p.payment && p.mode !== "invoice" && ["SUBMITTED", "UNDER_REVIEW", "AWAITING_PAYMENT"].includes(p.status) && (
          <p className="text-text-secondary py-2">
            {p.audience === "partner" ? "No card on file for this request yet." : "No card hold yet."}
          </p>
        )}
        {p.invoice && (
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <dt className="text-text-secondary">
              Tax invoice{" "}
              <span className="text-text-primary text-body-sm font-mono uppercase">{p.invoice.number ?? "—"}</span>
              {p.invoice.due_at && p.invoice.status !== "paid" && (
                <span className="text-text-muted text-body-sm block">
                  Due {formatDate(p.invoice.due_at.slice(0, 10))}
                </span>
              )}
            </dt>
            <dd className="flex items-center gap-2">
              <Pill tone={INVOICE_STATUS[p.invoice.status]?.tone ?? "neutral"}>
                {INVOICE_STATUS[p.invoice.status]?.label ?? p.invoice.status}
              </Pill>
              {p.invoice.hosted_url && (
                <a
                  href={p.invoice.hosted_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-primary text-body-sm underline"
                >
                  View<span className="sr-only"> invoice (opens in a new tab)</span>
                </a>
              )}
              {p.invoice.pdf_url && (
                <a href={p.invoice.pdf_url} className="text-text-primary text-body-sm underline">
                  PDF
                </a>
              )}
            </dd>
          </div>
        )}
        {(p.refunds ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <dt className="text-text-secondary">
              Refund · {formatDate(r.created_at.slice(0, 10))}
              {r.status === "failed" && r.failure_reason && (
                <span className="text-danger-fg text-body-sm block">{r.failure_reason}</span>
              )}
            </dt>
            <dd className="flex items-center gap-2">
              <span className="text-text-primary tabular-nums">{formatMoney(r.amount_cents, p.currency)}</span>
              <Pill tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "attention"}>
                {r.status === "succeeded" ? "Sent to card" : r.status === "failed" ? "Failed" : "Processing"}
              </Pill>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
