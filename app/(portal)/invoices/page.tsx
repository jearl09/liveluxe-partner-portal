import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionClaims } from "@/lib/db/server";
import { formatMoney } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import { listInvoices } from "@/lib/payments/load";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "border-success-border bg-success-bg text-success-fg" },
  open: { label: "Due", cls: "border-attention-border bg-attention-bg text-attention-fg" },
  draft: { label: "Draft", cls: "border-cream-300 bg-cream-100 text-ink-500" },
  void: { label: "Void", cls: "border-cream-300 bg-cream-100 text-ink-500" },
  uncollectible: { label: "Overdue", cls: "border-danger-border bg-danger-bg text-danger-fg" },
};

/** Tax invoices for the caller's organisation (§11.5). Stripe hosts the PDF; we link to it. */
export default async function InvoicesPage() {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  if (!can(claims.role, "invoices.download")) redirect("/");
  const items = await listInvoices();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Invoices"
        description="One tax invoice per confirmed booking. Download the PDF or pay online where an amount is due."
      />
      {items.length === 0 ? (
        <p className="text-ink-500 border-cream-200 rounded-xl border bg-white px-5 py-10 text-center text-sm">
          No invoices yet. They appear here as bookings are confirmed.
        </p>
      ) : (
        <div className="border-cream-200 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-ink-500 text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">Invoice</th>
                <th className="px-4 py-2 font-medium">Booking</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-cream-200 divide-y">
              {items.map(({ invoice: i, bookingReference, propertyName }) => {
                const s = STATUS[i.status] ?? { label: i.status, cls: "border-cream-300 bg-cream-100 text-ink-500" };
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-3 font-mono text-xs">{i.number ?? "—"}</td>
                    <td className="px-4 py-3">
                      {i.booking_id ? (
                        <Link href={`/requests/${i.booking_id}`} className="text-navy-900 hover:underline">
                          {bookingReference ?? "Booking"}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {propertyName && <span className="text-ink-500 block text-xs">{propertyName}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", s.cls)}>
                        {s.label}
                      </span>
                    </td>
                    <td className="text-ink-700 px-4 py-3 text-xs">
                      {i.due_at ? formatDate(i.due_at.slice(0, 10)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatMoney(i.amount_due_cents, i.currency)}
                      {i.status === "open" && i.amount_paid_cents > 0 && (
                        <span className="text-ink-500 block text-xs">
                          {formatMoney(i.amount_paid_cents, i.currency)} paid
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                      {i.hosted_url && (
                        <a
                          href={i.hosted_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gold-600 hover:underline"
                        >
                          {i.status === "open" ? "Pay" : "View"}
                        </a>
                      )}
                      {i.pdf_url && (
                        <>
                          {" · "}
                          <a href={i.pdf_url} className="text-gold-600 hover:underline">
                            PDF
                          </a>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
