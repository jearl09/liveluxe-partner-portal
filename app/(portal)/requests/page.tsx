import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Download, Inbox, Search, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable, type DataTableColumn, type SortDir } from "@/components/ui/data-table";
import { ListPagination } from "@/components/ui/list-pagination";
import { EmptyState } from "@/components/ui/states";
import { StatusPill } from "@/components/ui/status-pill";
import { fieldClass, labelClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Flash } from "@/components/requests/flash";
import type { BookingListRow } from "@/lib/admin/bookings";
import { getSessionClaims } from "@/lib/db/server";
import {
  DEFAULT_BOOKING_SORT,
  PARTNER_GROUPS,
  PARTNER_GROUP_LABELS,
  maskGuest,
  parseBookingSort,
  parsePartnerGroup,
  rowNextStep,
  type BookingSort,
  type BookingSortKey,
  type PartnerGroup,
} from "@/lib/domain/list-display";
import { listQueryString, parseListParams, type ListParams } from "@/lib/domain/list-params";
import { formatMoney } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import { loadPartnerRequests } from "@/lib/requests/partner-list";
import { cn, formatDayMonth, formatWhen } from "@/lib/utils";

export const metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

const REQUESTS = "/requests";
const sub = "text-text-muted block truncate";

const GROUP_HINT: Record<PartnerGroup, string> = {
  all: "Everything your organisation has sent",
  action: "Answer, pay or hold a card",
  progress: "With Live Luxe or being confirmed",
  confirmed: "Booked, upcoming or in the stay",
  closed: "Checked out, declined, expired, cancelled",
};

/**
 * Partner Requests (brief §7.6): every request the organisation has sent, by what it
 * needs. Five chips with counts, search by reference, claim or PO, sortable columns, a
 * Next step cell in plain words, and a CSV of the current view.
 */
export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const sp = await searchParams;
  const params = parseListParams(sp);
  const group = parsePartnerGroup(sp.group, sp.tab);
  const sort = parseBookingSort(sp.sort, sp.dir);
  const view = await loadPartnerRequests({
    orgId: claims.org_id,
    group,
    q: params.q,
    sort,
    page: params.page,
    pageSize: params.pageSize,
  });
  const now = new Date();
  const canBook = can(claims.role, "requests.submit");

  const extra = (g: PartnerGroup, s: BookingSort) => {
    const isDefault = s.key === DEFAULT_BOOKING_SORT.key && s.dir === DEFAULT_BOOKING_SORT.dir;
    return {
      group: g === "all" ? undefined : g,
      sort: isDefault ? undefined : s.key,
      dir: isDefault ? undefined : s.dir,
    };
  };
  const href = (patch: Partial<ListParams>, g: PartnerGroup = group, s: BookingSort = sort) =>
    `${REQUESTS}${listQueryString({ q: params.q, page: params.page, pageSize: params.pageSize, ...patch }, extra(g, s))}`;
  const exportHref = `/api/requests/export${listQueryString({ q: params.q }, extra(group, sort))}`;

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
      key: "property",
      header: "Property",
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
      optional: "xl",
      cell: (r) => (
        <span className="text-text-primary font-semibold">
          {r.totalCents != null ? formatMoney(r.totalCents, r.currency) : "—"}
        </span>
      ),
    },
    { key: "status", header: "Status", status: true, cell: (r) => <StatusPill status={r.status} /> },
    {
      key: "next",
      header: "Next step",
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
          when: (iso) => formatWhen(iso, now),
          date: formatDayMonth,
        });
        return (
          <span
            className={cn("block max-w-44 min-w-32", n.urgent ? "text-text-gold font-semibold" : "text-text-secondary")}
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
      optional: "xl",
      cell: (r) => <span className="text-text-muted block max-w-32">{formatWhen(r.updatedAt, now)}</span>,
    },
  ];

  const nothingYet = view.counts.all === 0 && !params.q;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-h1 text-text-primary font-serif tracking-tight">Requests</h1>
          <p className="text-text-secondary text-body mt-1">
            Everything your organisation has asked for, and where each stands.
          </p>
        </div>
        {canBook && (
          <Link href="/search" className={cn(buttonVariants({ variant: "primary" }), "w-full sm:w-auto")}>
            <Search className="h-4 w-4" aria-hidden /> Find a property
          </Link>
        )}
      </header>

      <Flash error={Array.isArray(sp.error) ? sp.error[0] : sp.error} />

      {nothingYet ? (
        <div className="border-subtle bg-surface rounded-card border">
          <EmptyState
            icon={Inbox}
            title="No requests yet"
            body="Find a property for your dates and send a request. It shows here while Live Luxe reviews it, and stays here as your record."
            action={
              canBook ? (
                <Link href="/search" className={buttonVariants({ variant: "primary" })}>
                  Find a property
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          {view.counts.action > 0 && group !== "action" && (
            <Link
              href={href({ page: 1 }, "action")}
              className="border-attention-border bg-attention-bg border-l-attention-fg rounded-card text-text-primary focus-visible:outline-focus flex items-center justify-between gap-3 border border-l-4 px-5 py-3 font-semibold focus-visible:outline-2"
            >
              <span>
                {view.counts.action} {view.counts.action === 1 ? "request needs" : "requests need"} your action
              </span>
              <span className="inline-flex items-center gap-1">
                Show {view.counts.action === 1 ? "it" : "them"} <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          )}

          <nav aria-label="Request groups" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="border-subtle bg-surface rounded-card flex min-w-max border sm:grid sm:min-w-0 sm:grid-cols-5">
              {PARTNER_GROUPS.map((g, i) => {
                const active = group === g;
                return (
                  <li key={g} className={cn(i > 0 && "border-subtle border-l")}>
                    <Link
                      href={href({ page: 1 }, g)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "focus-visible:outline-focus relative block h-full px-4 py-3 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2",
                        active ? "bg-inset" : "hover:bg-inset",
                      )}
                    >
                      {active && <span className="bg-gold absolute inset-x-0 bottom-0 h-0.5" aria-hidden />}
                      <span className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            "text-body-sm font-semibold whitespace-nowrap",
                            active ? "text-text-primary" : "text-text-secondary",
                            g === "action" && view.counts.action > 0 && "text-text-gold",
                          )}
                        >
                          {PARTNER_GROUP_LABELS[g]}
                        </span>
                        <span className="text-text-primary text-h3 font-semibold tabular-nums">{view.counts[g]}</span>
                      </span>
                      <span className="text-text-muted text-body-sm mt-0.5 hidden lg:block">{GROUP_HINT[g]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <form
            action={REQUESTS}
            method="get"
            role="search"
            aria-label="Search requests"
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            {Object.entries(extra(group, sort)).map(
              ([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />,
            )}
            <label className={cn(labelClass, "flex-1")}>
              Reference, claim, PO or guest
              <input
                name="q"
                type="search"
                defaultValue={params.q}
                placeholder="LLX-2026-000412 or a claim number"
                maxLength={80}
                autoComplete="off"
                className={`${fieldClass} mt-1`}
              />
            </label>
            <SubmitButton variant="secondary" pendingLabel="Searching…">
              <Search className="h-4 w-4" aria-hidden /> Search
            </SubmitButton>
            {params.q && (
              <Link href={href({ q: "", page: 1 })} className={buttonVariants({ variant: "tertiary" })}>
                Clear
              </Link>
            )}
            <a href={exportHref} className={cn(buttonVariants({ variant: "tertiary" }), "sm:ml-auto")} download>
              <Download className="h-4 w-4" aria-hidden /> Download CSV
            </a>
          </form>

          <div className="border-subtle bg-surface rounded-card overflow-clip border">
            <DataTable
              columns={columns}
              rows={view.rows}
              rowKey={(r) => r.id}
              rowHref={(r) => `${REQUESTS}/${r.id}`}
              rowLabel={(r) => `Open ${r.reference}, ${r.propertyName}`}
              sort={{ key: sort.key, dir: sort.dir }}
              sortHref={(key: string, dir: SortDir) => href({ page: 1 }, group, { key: key as BookingSortKey, dir })}
              caption={`Requests, ${PARTNER_GROUP_LABELS[group].toLowerCase()}`}
              actions={(r) => <CopyButton value={r.reference} label={r.reference} />}
              empty={
                <EmptyState
                  icon={SearchX}
                  title={params.q ? "No requests match" : `Nothing under ${PARTNER_GROUP_LABELS[group]}`}
                  body={
                    params.q
                      ? "Check the reference or claim number, or search all requests."
                      : group === "action"
                        ? "Nothing is waiting on you."
                        : "Try another group."
                  }
                  action={
                    <Link href={REQUESTS} className={buttonVariants({ variant: "secondary" })}>
                      Show all requests
                    </Link>
                  }
                />
              }
            />
          </div>
          <ListPagination
            page={view}
            noun="request"
            hrefFor={(p) => href({ page: p })}
            sizeHrefFor={(s) => href({ pageSize: s as 25 | 50 | 100, page: 1 })}
          />
        </>
      )}
    </div>
  );
}
