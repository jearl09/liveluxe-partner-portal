import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ListPagination } from "@/components/ui/list-pagination";
import { Freshness } from "@/components/requests/freshness";
import { ListFilters } from "@/components/requests/list-filters";
import { RequestsTable } from "@/components/requests/requests-table";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/domain/booking-state-machine";
import { STATUS_LABELS } from "@/lib/domain/dashboard";
import { hasActiveFilters, listQueryString, parseListParams } from "@/lib/domain/list-params";
import { listOrgOptions } from "@/lib/partners/load";
import { listAllRequests } from "@/lib/requests/load";
import { cn } from "@/lib/utils";

export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const FILTERS: (BookingStatus | "all")[] = [
  "all",
  "SUBMITTED",
  "UNDER_REVIEW",
  "COUNTER_OFFERED",
  "APPROVED",
  "CONFIRMED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
];

/** Every request across every partner, by status, partner and search, paged in the database (§13.4 "Bookings"). */
export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status: BookingStatus | "all" = (BOOKING_STATUSES as readonly string[]).includes(raw ?? "")
    ? (raw as BookingStatus)
    : "all";
  const params = parseListParams(sp);
  const [page, orgs] = await Promise.all([listAllRequests({ status, ...params }), listOrgOptions()]);
  const renderedAt = new Date().toISOString();
  const statusKey = status === "all" ? undefined : status;
  const href = (patch: Partial<typeof params>, s: BookingStatus | "all" = status) =>
    `/admin/bookings${listQueryString({ ...params, ...patch }, { status: s === "all" ? undefined : s })}`;
  const filtered = hasActiveFilters(params) || status !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Bookings"
        description="All partner requests, newest activity first."
        actions={<Freshness renderedAt={renderedAt} />}
      />
      <div className="space-y-3">
        <ListFilters
          action="/admin/bookings"
          params={params}
          orgs={orgs}
          carry={{ status: statusKey }}
          clearHref="/admin/bookings"
        />
        <nav aria-label="Status filter" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={href({ page: 1 }, f)}
              aria-current={status === f ? "page" : undefined}
              className={cn(
                "focus-visible:ring-ring ring-offset-background rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                status === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-foreground hover:bg-muted bg-card",
              )}
            >
              {f === "all" ? "All" : STATUS_LABELS[f]}
            </Link>
          ))}
        </nav>
      </div>
      <RequestsTable
        rows={page.rows}
        ops
        hrefFor={(r) => `/admin/bookings/${r.id}`}
        emptyTitle={filtered ? "No bookings match those filters" : "No bookings yet"}
        emptyHint={
          filtered
            ? "Try another status, partner or search term, or clear the filters."
            : "Requests appear here as partners submit them."
        }
      />
      <ListPagination
        page={page}
        noun="booking"
        hrefFor={(p) => href({ page: p })}
        sizeHrefFor={(s) => href({ pageSize: s as 25 | 50 | 100, page: 1 })}
      />
    </div>
  );
}
