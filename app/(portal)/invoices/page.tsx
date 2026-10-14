import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, FileDown, ReceiptText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { STATUS_TONE_CLASSES, pillClass } from "@/components/ui/status-pill";
import { getSessionClaims } from "@/lib/db/server";
import {
  INVOICE_STATUS_LABELS,
  balanceOf,
  invoiceStatus,
  invoiceSummary,
  type InvoiceDisplayStatus,
} from "@/lib/domain/invoices";
import { formatMoney } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import { formatDuration, type StatusTone } from "@/lib/domain/status";
import { listInvoices, type InvoiceListItem } from "@/lib/payments/load";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const TONE: Record<InvoiceDisplayStatus, StatusTone> = {
  draft: "muted",
  open: "attention",
  overdue: "danger",
  paid: "success",
  void: "muted",
};

const VIEWS = ["all", "due", "overdue", "paid"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABELS: Record<View, string> = { all: "All", due: "To pay", overdue: "Overdue", paid: "Paid" };

const monthIn = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit" }).format(
    new Date(iso),
  );

/**
 * Invoices (brief §7.7): what do we owe and when. Outstanding, overdue and paid this
 * month at the top; then each invoice with Stripe's number, its booking, when it was
 * issued and is due, the amount and a plain status, with Pay now where money is due.
 */
export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  if (!can(claims.role, "invoices.download")) redirect("/");
  const sp = await searchParams;
  const raw = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const view: View = (VIEWS as readonly string[]).includes(raw ?? "") ? (raw as View) : "all";
  const items = await listInvoices();
  const now = new Date();
  const canPay = claims.role.startsWith("partner_");
  const s = invoiceSummary(
    items.map((x) => x.invoice),
    now,
    monthIn,
  );
  const status = (x: InvoiceListItem) => invoiceStatus(x.invoice, now);
  const shown = items.filter((x) => {
    const st = status(x);
    if (view === "due") return st === "open" || st === "overdue";
    if (view === "overdue") return st === "overdue";
    if (view === "paid") return st === "paid";
    return true;
  });

  const due = (x: InvoiceListItem) => {
    const d = x.invoice.due_at;
    if (!d) return <span className="text-text-muted">—</span>;
    const st = status(x);
    const ms = new Date(d).getTime() - now.getTime();
    const rel =
      st === "paid" || st === "void" ? null : ms < 0 ? `${formatDuration(-ms)} overdue` : `in ${formatDuration(ms)}`;
    return (
      <span className="block whitespace-nowrap">
        <span className={cn("block", st === "overdue" ? "text-danger-fg font-semibold" : "text-text-primary")}>
          {formatDate(d.slice(0, 10))}
        </span>
        {rel && <span className={cn("block", st === "overdue" ? "text-danger-fg" : "text-text-muted")}>{rel}</span>}
      </span>
    );
  };

  const columns: DataTableColumn<InvoiceListItem>[] = [
    {
      key: "number",
      header: "Invoice",
      primary: true,
      cell: (x) => (
        <span className="text-text-primary font-mono font-semibold tracking-tight">{x.invoice.number ?? "Draft"}</span>
      ),
    },
    {
      key: "booking",
      header: "Booking",
      cell: (x) =>
        x.invoice.booking_id ? (
          <span className="block max-w-56">
            <Link
              href={`/requests/${x.invoice.booking_id}`}
              className="text-text-primary relative z-10 font-mono font-semibold underline-offset-4 hover:underline"
            >
              {x.bookingReference ?? "Booking"}
            </Link>
            {x.propertyName && <span className="text-text-muted block truncate">{x.propertyName}</span>}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "issued",
      header: "Issued",
      cell: (x) => (
        <span className="text-text-secondary whitespace-nowrap">
          {formatDate((x.invoice.sent_at ?? x.invoice.created_at).slice(0, 10))}
        </span>
      ),
    },
    { key: "due", header: "Due", cell: due },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      cell: (x) => (
        <span className="block">
          <span className="text-text-primary font-semibold">
            {formatMoney(x.invoice.amount_due_cents, x.invoice.currency)}
          </span>
          {status(x) !== "paid" && x.invoice.amount_paid_cents > 0 && (
            <span className="text-text-muted block">
              {formatMoney(balanceOf(x.invoice), x.invoice.currency)} left to pay
            </span>
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      status: true,
      cell: (x) => {
        const st = status(x);
        return <span className={cn(pillClass, STATUS_TONE_CLASSES[TONE[st]])}>{INVOICE_STATUS_LABELS[st]}</span>;
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      hideOnCard: false,
      cardLabel: " ",
      cell: (x) => {
        const st = status(x);
        const payable = canPay && (st === "open" || st === "overdue") && x.invoice.hosted_url;
        return (
          <span className="relative z-10 flex flex-wrap items-center justify-end gap-2">
            {payable && (
              <a
                href={x.invoice.hosted_url!}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
              >
                Pay now <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only"> (opens Stripe in a new tab)</span>
              </a>
            )}
            {!payable && x.invoice.hosted_url && (
              <a
                href={x.invoice.hosted_url}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "tertiary", size: "sm" }))}
              >
                View <span className="sr-only">invoice {x.invoice.number} (opens in a new tab)</span>
              </a>
            )}
            {x.invoice.pdf_url && (
              <a href={x.invoice.pdf_url} className={cn(buttonVariants({ variant: "tertiary", size: "sm" }))}>
                <FileDown className="h-4 w-4" aria-hidden /> PDF
                <span className="sr-only"> of invoice {x.invoice.number}</span>
              </a>
            )}
          </span>
        );
      },
    },
  ];

  const tiles = [
    {
      label: "Outstanding",
      value: formatMoney(s.outstandingCents, items[0]?.invoice.currency ?? "AUD"),
      hint: s.openCount === 0 ? "Nothing to pay" : `${s.openCount} ${s.openCount === 1 ? "invoice" : "invoices"} open`,
      alarm: false,
    },
    {
      label: "Overdue",
      value: formatMoney(s.overdueCents, items[0]?.invoice.currency ?? "AUD"),
      hint: s.overdueCount === 0 ? "None overdue" : `${s.overdueCount} past the due date`,
      alarm: s.overdueCount > 0,
    },
    {
      label: "Paid this month",
      value: formatMoney(s.paidThisMonthCents, items[0]?.invoice.currency ?? "AUD"),
      hint: "Received by Live Luxe",
      alarm: false,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-text-primary font-serif tracking-tight">Invoices</h1>
        <p className="text-text-secondary mt-1">
          One tax invoice per confirmed booking, as issued by Stripe. Pay online or download the PDF.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="border-subtle bg-surface rounded-card border">
          <EmptyState
            icon={ReceiptText}
            title="No invoices yet"
            body="Live Luxe issues a tax invoice when a booking is confirmed. It shows here, and is emailed to your billing contact."
          />
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-3" aria-label="Summary">
            {tiles.map((t) => (
              <li
                key={t.label}
                className={cn(
                  "border-subtle bg-surface rounded-card border p-4 sm:p-5",
                  t.alarm && "border-danger-border bg-danger-bg",
                )}
              >
                <span
                  className={cn("text-body-sm block font-semibold", t.alarm ? "text-danger-fg" : "text-text-secondary")}
                >
                  {t.label}
                </span>
                <span
                  className={cn(
                    "text-h1 mt-1 block font-semibold tabular-nums",
                    t.alarm ? "text-danger-fg" : "text-text-primary",
                  )}
                >
                  {t.value}
                </span>
                <span className={cn("text-body-sm block", t.alarm ? "text-danger-fg" : "text-text-muted")}>
                  {t.hint}
                </span>
              </li>
            ))}
          </ul>

          <nav aria-label="Invoice filters">
            <ul className="flex flex-wrap gap-2">
              {VIEWS.map((v) => (
                <li key={v}>
                  <Link
                    href={v === "all" ? "/invoices" : `/invoices?view=${v}`}
                    aria-current={view === v ? "page" : undefined}
                    className={cn(
                      "rounded-pill text-body-sm focus-visible:outline-focus inline-flex border px-3.5 py-1.5 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                      view === v
                        ? "border-navy bg-navy text-on-navy dark:border-gold dark:bg-gold dark:text-on-gold"
                        : "border-strong-border bg-surface text-text-primary hover:bg-inset",
                    )}
                  >
                    {VIEW_LABELS[v]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-subtle bg-surface rounded-card overflow-clip border">
            <DataTable
              columns={columns}
              rows={shown}
              rowKey={(x) => x.invoice.id}
              caption="Invoices, newest first"
              empty={
                <EmptyState
                  icon={ReceiptText}
                  title={view === "overdue" ? "Nothing overdue" : "No invoices here"}
                  body={view === "overdue" || view === "due" ? "You are up to date." : "Try another filter."}
                  action={
                    <Link href="/invoices" className={buttonVariants({ variant: "secondary" })}>
                      Show all invoices
                    </Link>
                  }
                />
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
