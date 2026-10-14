import Link from "next/link";
import { Inbox, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable, type DataTableColumn, type SortDir } from "@/components/ui/data-table";
import { ListPagination } from "@/components/ui/list-pagination";
import { SlaBadge } from "@/components/ui/sla-badge";
import { EmptyState } from "@/components/ui/states";
import { StatusPill } from "@/components/ui/status-pill";
import { Freshness } from "@/components/requests/freshness";
import { ListFilters } from "@/components/requests/list-filters";
import { loadBookings, type BookingListRow } from "@/lib/admin/bookings";
import {
  BOOKING_GROUPS,
  BOOKING_GROUP_LABELS,
  DEFAULT_BOOKING_SORT,
  maskGuest,
  parseBookingGroup,
  parseBookingSort,
  rowNextStep,
  type BookingGroup,
  type BookingSort,
  type BookingSortKey,
} from "@/lib/domain/list-display";
import { hasActiveFilters, listQueryString, parseListParams, type ListParams } from "@/lib/domain/list-params";
import { formatMoney } from "@/lib/domain/money";
import { listOrgOptions } from "@/lib/partners/load";
import { cn, formatDayMonth, formatWhen } from "@/lib/utils";

export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const BOOKINGS = "/admin/bookings";
const sub = "text-text-muted block truncate";

const GROUP_HINT: Record<BookingGroup, string> = {
  all: "Every request from every partner",
  live: "Sent, being decided, or waiting on payment",
  confirmed: "Booked, upcoming or in the stay",
  closed: "Checked out, declined, expired, cancelled",
};

/**
 * Ops Bookings (brief §6.4): every request across every partner. Four status groups
 * with counts, partner and search filters, sortable columns, and a "Next step" cell
 * that says what happens next and by when. Everything lives in the URL.
 */
export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const sp = await searchParams;
  const params = parseListParams(sp);
  const group = parseBookingGroup(sp.group);
  const sort = parseBookingSort(sp.sort, sp.dir);
  const [view, orgs] = await Promise.all([
    loadBookings({ group, orgId: params.orgId, q: params.q, sort, page: params.page, pageSize: params.pageSize }),
    listOrgOptions(),
  ]);
  const now = new Date();

  const extra = (g: BookingGroup, s: BookingSort) => ({
    group: g === "all" ? undefined : g,
    sort: s.key === DEFAULT_BOOKING_SORT.key && s.dir === DEFAULT_BOOKING_SORT.dir ? undefined : s.key,
    dir: s.key === DEFAULT_BOOKING_SORT.key && s.dir === DEFAULT_BOOKING_SORT.dir ? undefined : s.dir,
  });
  const href = (patch: Partial<ListParams>, g: BookingGroup = group, s: BookingSort = sort) =>
    `${BOOKINGS}${listQueryString({ ...params, ...patch }, extra(g, s))}`;
  const filtered = hasActiveFilters(params);

  const columns: DataTableColumn<BookingListRow>[] = [
    {
      key: "reference",
      header: "Reference",
      primary: true,
      sortable: true,
      cell: (r) => (
        <span className="block">
          <span className="text-text-primary block font-mono font-semibold tracking-tight">{r.reference}</span>
          {(r.claimRef || r.poNumber) && (
            <span className={sub}>{r.claimRef ? `Claim ${r.claimRef}` : `PO ${r.poNumber}`}</span>
          )}
        </span>
      ),
    },
    {
      key: "partner",
      header: "Partner",
      cell: (r) => (
        <span className="block max-w-40">
          <span className="text-text-primary block truncate">{r.orgName ?? "Partner"}</span>
          {r.viaLiveLuxe && <span className={sub}>via Live Luxe</span>}
        </span>
      ),
    },
    {
      key: "property",
      header: "Property",
      optional: "xl",
      cell: (r) => (
        <span className="block max-w-40">
          <span className="text-text-primary block truncate">{r.propertyName}</span>
          {r.suburb && <span className={sub}>{r.suburb}</span>}
        </span>
      ),
    },
    {
      key: "checkin",
      header: "Stay",
      sortable: true,
      cell: (r) => (
        <span className="block whitespace-nowrap">
          <span className="text-text-primary block tabular-nums">
            {formatDayMonth(r.checkIn)} – {formatDayMonth(r.checkOut)}
          </span>
          <span className={sub}>
            {r.nights} {r.nights === 1 ? "night" : "nights"}
          </span>
        </span>
      ),
    },
    {
      key: "guest",
      header: "Guest",
      optional: "xl",
      cell: (r) => <span className="text-text-secondary whitespace-nowrap">{maskGuest(r.guestName) ?? "—"}</span>,
    },
    {
      key: "total",
      header: "Total",
      numeric: true,
      sortable: true,
      cell: (r) => (
        <span className="text-text-primary font-semibold">
          {r.totalCents != null ? formatMoney(r.totalCents, r.currency) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      status: true,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={r.status} />
          <SlaBadge
            status={r.status}
            submittedAt={r.submittedAt}
            decisionDueAt={r.decisionDueAt}
            pausedAt={r.slaPausedAt}
            now={now}
          />
        </span>
      ),
    },
    {
      key: "next",
      header: "Next step",
      cell: (r) => {
        const n = rowNextStep({
          status: r.status,
          audience: "ops",
          now,
          decisionDueAt: r.decisionDueAt,
          holdExpiresAt: r.holdExpiresAt,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          checkinReleasedAt: r.checkinReleasedAt,
          cardNeeded: r.cardNeeded,
          approvedAt: r.approvedAt,
          when: (iso) => formatWhen(iso, now),
          date: formatDayMonth,
        });
        return (
          <span
            className={cn("block max-w-44 min-w-36", n.urgent ? "text-danger-fg font-semibold" : "text-text-secondary")}
          >
            {n.text}
          </span>
        );
      },
    },
    {
      key: "updated",
      header: "Updated",
      sortable: true,
      optional: "2xl",
      cell: (r) => <span className="text-text-muted block max-w-32">{formatWhen(r.updatedAt, now)}</span>,
    },
  ];

  const anything = view.counts.all > 0 || filtered;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Operations</p>
          <h1 className="text-h1 text-text-primary font-serif tracking-tight">Bookings</h1>
          <p className="text-text-secondary text-body mt-1">
            Every request from every partner, newest activity first unless you sort.
          </p>
        </div>
        <Freshness renderedAt={now.toISOString()} />
      </header>

      {!anything ? (
        <div className="border-subtle bg-surface rounded-card border">
          <EmptyState
            icon={Inbox}
            title="No bookings yet"
            body="Requests appear here the moment a partner sends one. The ones waiting on Live Luxe are in the queue."
            action={
              <Link href="/admin/queue" className={buttonVariants({ variant: "secondary" })}>
                Go to the request queue
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <nav aria-label="Status groups">
            <ul className="border-subtle bg-surface rounded-card grid grid-cols-2 overflow-hidden border sm:grid-cols-4">
              {BOOKING_GROUPS.map((g, i) => {
                const active = group === g;
                return (
                  <li
                    key={g}
                    className={cn(
                      i > 0 && "sm:border-subtle sm:border-l",
                      i > 1 && "max-sm:border-subtle max-sm:border-t",
                      i % 2 === 1 && "max-sm:border-subtle max-sm:border-l",
                    )}
                  >
                    <Link
                      href={href({ page: 1 }, g)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "focus-visible:outline-focus relative block h-full px-4 py-3 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2",
                        active ? "bg-inset" : "hover:bg-inset",
                      )}
                    >
                      {active && <span className="bg-gold absolute inset-x-0 bottom-0 h-0.5" aria-hidden />}
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "text-body-sm font-semibold",
                            active ? "text-text-primary" : "text-text-secondary",
                          )}
                        >
                          {BOOKING_GROUP_LABELS[g]}
                        </span>
                        <span className="text-text-primary text-h3 font-semibold tabular-nums">{view.counts[g]}</span>
                      </span>
                      <span className="text-text-muted text-body-sm mt-0.5 block max-sm:hidden">{GROUP_HINT[g]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="space-y-3">
            <ListFilters
              action={BOOKINGS}
              params={params}
              orgs={orgs}
              carry={extra(group, sort)}
              clearHref={`${BOOKINGS}${listQueryString({}, extra(group, sort))}`}
            />
            {filtered && (
              <p className="text-text-secondary text-body-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {view.total} {view.total === 1 ? "match" : "matches"}
                  {params.orgId && <> · {orgs.find((o) => o.id === params.orgId)?.name ?? "one partner"}</>}
                  {params.q && <> · “{params.q}”</>}
                </span>
                <Link href={BOOKINGS} className="text-text-primary font-semibold underline underline-offset-4">
                  Clear all
                </Link>
              </p>
            )}
          </div>

          <div className="border-subtle bg-surface rounded-card overflow-clip border">
            <DataTable
              columns={columns}
              rows={view.rows}
              rowKey={(r) => r.id}
              rowHref={(r) => `${BOOKINGS}/${r.id}`}
              rowLabel={(r) => `Open ${r.reference} from ${r.orgName ?? "a partner"}`}
              sort={{ key: sort.key, dir: sort.dir }}
              sortHref={(key: string, dir: SortDir) => href({ page: 1 }, group, { key: key as BookingSortKey, dir })}
              dense
              caption={`Bookings, ${BOOKING_GROUP_LABELS[group].toLowerCase()}, sorted by ${sort.key === "checkin" ? "check-in" : sort.key} ${sort.dir === "asc" ? "ascending" : "descending"}`}
              actions={(r) => <CopyButton value={r.reference} label={r.reference} />}
              empty={
                <EmptyState
                  icon={SearchX}
                  title="No bookings match"
                  body="Try another status group, partner or search term."
                  action={
                    <Link href={BOOKINGS} className={buttonVariants({ variant: "secondary" })}>
                      Show every booking
                    </Link>
                  }
                />
              }
            />
          </div>
          <ListPagination
            page={view}
            noun="booking"
            hrefFor={(p) => href({ page: p })}
            sizeHrefFor={(s) => href({ pageSize: s as 25 | 50 | 100, page: 1 })}
          />
        </>
      )}
    </div>
  );
}
