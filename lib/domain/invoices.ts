/**
 * Invoice display rules (brief §7.7): plain statuses with Overdue derived from the due
 * date, and the summary strip. Pure; money is integer cents.
 */
export type InvoiceDisplayStatus = "draft" | "open" | "overdue" | "paid" | "void";

export const INVOICE_STATUS_LABELS: Record<InvoiceDisplayStatus, string> = {
  draft: "Draft",
  open: "Open",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

export interface InvoiceFacts {
  status: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  due_at: string | null;
  paid_at: string | null;
}

export function invoiceStatus(i: InvoiceFacts, now: Date): InvoiceDisplayStatus {
  if (i.status === "paid") return "paid";
  if (i.status === "void") return "void";
  if (i.status === "draft") return "draft";
  if (i.status === "uncollectible") return "overdue";
  if (i.due_at && new Date(i.due_at).getTime() < now.getTime()) return "overdue";
  return "open";
}

/** What is still owed on one invoice. */
export const balanceOf = (i: InvoiceFacts) => Math.max(0, i.amount_due_cents - i.amount_paid_cents);

export interface InvoiceSummary {
  outstandingCents: number;
  openCount: number;
  overdueCount: number;
  overdueCents: number;
  paidThisMonthCents: number;
}

/** `monthKey` is "YYYY-MM" in the business timezone, so "this month" means Melbourne's month. */
export function invoiceSummary(
  items: readonly InvoiceFacts[],
  now: Date,
  monthOf: (iso: string) => string,
): InvoiceSummary {
  const s: InvoiceSummary = {
    outstandingCents: 0,
    openCount: 0,
    overdueCount: 0,
    overdueCents: 0,
    paidThisMonthCents: 0,
  };
  const thisMonth = monthOf(now.toISOString());
  for (const i of items) {
    const st = invoiceStatus(i, now);
    if (st === "open" || st === "overdue") {
      s.outstandingCents += balanceOf(i);
      s.openCount += 1;
    }
    if (st === "overdue") {
      s.overdueCount += 1;
      s.overdueCents += balanceOf(i);
    }
    if (st === "paid" && i.paid_at && monthOf(i.paid_at) === thisMonth) s.paidThisMonthCents += i.amount_paid_cents;
  }
  return s;
}
