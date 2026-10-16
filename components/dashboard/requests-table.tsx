import Link from "next/link";
import { ArrowRight, CalendarSearch } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { StatusPill } from "@/components/ui/status-pill";
import type { RequestTableRow } from "@/lib/domain/dashboard";
import { rowNextStep } from "@/lib/domain/list-display";
import { PropertyThumb } from "./property-thumb";
import { cn, formatDayMonth, formatDayName, formatWhen } from "@/lib/utils";

/**
 * Requests in progress (brief §7.2): live requests and stays starting within 14 days,
 * at most six, on the same DataTable as Requests. The status column carries the next step under the pill,
 * in the same words as the Requests list and the request page.
 */
export function RequestsTable({
  rows,
  firstTime,
  now = new Date(),
}: {
  rows: RequestTableRow[];
  firstTime: boolean;
  now?: Date;
}) {
  const columns: DataTableColumn<RequestTableRow>[] = [
    {
      key: "reference",
      header: "Reference",
      primary: true,
      cell: (r) => (
        <span className="block">
          <span className="text-text-primary block font-mono font-semibold tracking-tight">{r.reference}</span>
          {(r.claimRef || r.poNumber) && (
            <span className="text-text-muted block">{r.claimRef ? `Claim ${r.claimRef}` : `PO ${r.poNumber}`}</span>
          )}
        </span>
      ),
    },
    {
      key: "property",
      header: "Property",
      cell: (r) => (
        <span className="flex items-center gap-3">
          <PropertyThumb url={r.photoUrl} />
          <span className="block max-w-44 min-w-0">
            <span className="text-text-primary line-clamp-2">{r.propertyName}</span>
            {r.suburb && <span className="text-text-muted block truncate">{r.suburb}</span>}
          </span>
        </span>
      ),
    },
    {
      key: "stay",
      header: "Stay",
      cell: (r) => (
        <span className="block whitespace-nowrap">
          <span className="text-text-primary block tabular-nums">
            {formatDayMonth(r.checkIn)} – {formatDayMonth(r.checkOut)}
          </span>
          <span className="text-text-muted block">
            {r.nights} {r.nights === 1 ? "night" : "nights"}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      status: true,
      // Status and what happens next in one column, so the table fits its card at every width from 1024 px.
      cell: (r) => {
        const n = rowNextStep({
          status: r.status,
          audience: "partner",
          now,
          decisionDueAt: r.decisionDueAt,
          holdExpiresAt: r.holdExpiresAt,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          checkinReleasedAt: r.checkinReleasedAt,
          cardNeeded: r.cardNeeded,
          approvedAt: r.approvedAt,
          checkinReleasesAt: r.checkinReleasesAt,
          when: (iso) => formatWhen(iso, now),
          date: formatDayMonth,
          day: (iso) => formatDayName(iso),
        });
        return (
          <span className="flex max-w-48 flex-col items-start gap-1">
            <StatusPill status={r.status} />
            <span className={cn("text-body-sm", n.urgent ? "text-text-gold font-semibold" : "text-text-secondary")}>
              {n.text}
            </span>
          </span>
        );
      },
    },
  ];

  return (
    <section aria-labelledby="requests-heading" className="border-subtle bg-surface rounded-card border">
      <div className="border-subtle flex items-center justify-between gap-4 border-b px-5 py-4">
        <h2 id="requests-heading">Requests in progress</h2>
        <Link
          href="/requests"
          className="text-text-primary text-body-sm inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline print:hidden"
        >
          All requests <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/requests/${r.id}`}
        rowLabel={(r) => `Open ${r.reference}, ${r.propertyName}`}
        dense
        caption="Requests in progress and stays starting in the next 14 days"
        empty={
          <EmptyState
            icon={CalendarSearch}
            title={firstTime ? "No requests yet" : "Nothing in progress"}
            body={
              firstTime
                ? "Find a property for your dates and send a request. It will show here while Live Luxe reviews it."
                : "Nothing is waiting and no stay starts in the next two weeks. Earlier and later bookings are under All requests."
            }
            action={
              <Link href="/search" className={buttonVariants({ variant: "secondary" })}>
                Find a property
              </Link>
            }
          />
        }
      />
    </section>
  );
}
