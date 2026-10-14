import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, SearchX } from "lucide-react";
import { QueueList, type QueueItem, type QueueTone } from "@/components/admin/queue-list";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, SyncState } from "@/components/ui/states";
import { SlaBadge } from "@/components/ui/sla-badge";
import { Flash } from "@/components/requests/flash";
import { Freshness } from "@/components/requests/freshness";
import { ListFilters } from "@/components/requests/list-filters";
import { QuoteLines } from "@/components/requests/quote-lines";
import { ApproveAction, AssignAction, CounterAction, DeclineAction } from "@/components/requests/request-actions";
import { loadQueue, type QueueRow } from "@/lib/admin/queue";
import { getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
import { hasActiveFilters, listQueryString, parseListParams } from "@/lib/domain/list-params";
import { formatMoney } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import {
  QUEUE_VIEW_LABELS,
  QUEUE_VIEWS,
  awaitingPartner,
  inView,
  parseQueueView,
  queueCounts,
  queueSubtitle,
  type QueueView,
} from "@/lib/domain/queue";
import { formatDuration } from "@/lib/domain/status";
import { loadShell } from "@/lib/layout/shell";
import { listOrgOptions } from "@/lib/partners/load";
import { cn, formatDayMonth, formatWhen } from "@/lib/utils";

export const metadata = { title: "Request queue" };
export const dynamic = "force-dynamic";

const QUEUE = "/admin/queue";
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const VIEW_HINT: Record<QueueView, string> = {
  breached: "Past their decision deadline",
  soon: "Deadline in the next two hours",
  waiting: "Every request Live Luxe has to decide",
  partner: "Card hold or counter-offer pending",
};

function tone(row: QueueRow): QueueTone {
  if (awaitingPartner(row)) return "partner";
  if (row.band === "breached") return "breached";
  if (row.band === "at_risk") return "at_risk";
  return "on_track";
}

const sub = "text-text-muted block truncate";

/**
 * The ops request queue (brief §6.3): what Live Luxe has to decide, most urgent first.
 * Four summary cards that are also the filters, one row per request with the SLA
 * band down its left edge, Approve on the row and the other decisions one click
 * away in its details. Partner and search filters are a URL, so a view can be shared.
 */
export default async function QueuePage({ searchParams }: PageProps<"/admin/queue">) {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  const sp = await searchParams;
  const params = parseListParams(sp);
  const view = parseQueueView(sp.view);
  const [data, orgs, shell] = await Promise.all([
    loadQueue({ orgId: params.orgId, q: params.q }),
    listOrgOptions(),
    loadShell(claims, "ops"),
  ]);
  const now = new Date();
  const today = todayIn("Australia/Melbourne");
  const mayDecide = can(claims.role, "requests.approve");
  const counts = queueCounts(data.rows, now);
  const filtered = hasActiveFilters(params) || !!view;
  const viewHref = (v: QueueView | null) =>
    `${QUEUE}${listQueryString({ orgId: params.orgId, q: params.q }, { view: v ?? undefined })}`;

  // Live Luxe's own work first (by deadline), then what is waiting on partners.
  const ordered = [...data.rows.filter((r) => !awaitingPartner(r)), ...data.rows.filter(awaitingPartner)];
  const shown = view ? ordered.filter((r) => inView(r, view, now)) : ordered;

  const items: QueueItem[] = shown.map((row) => {
    const r = row.r;
    const money = (c: number) => formatMoney(c, r.currency);
    const who = `${row.requesterName ?? "The partner"}${row.orgName ? ` (${row.orgName})` : ""} is emailed.`;
    const guests = r.guests_adults + r.guests_children;
    const h = row.history;
    const earlier = h.total - 1;
    return {
      id: r.id,
      href: `/admin/bookings/${r.id}`,
      label: `${r.reference} from ${row.orgName ?? "a partner"}`,
      tone: tone(row),
      cells: [
        <span key="sla" className="flex flex-col items-start gap-1">
          {row.cardNeeded ? (
            <span className="text-text-secondary font-semibold">Card not held</span>
          ) : (
            <SlaBadge
              status={r.status}
              submittedAt={r.submitted_at}
              decisionDueAt={r.decision_due_at}
              pausedAt={r.sla_paused_at}
              now={now}
            />
          )}
          {r.status === "UNDER_REVIEW" && <span className="text-text-muted">Being reviewed</span>}
        </span>,
        <span key="ref" className="block">
          <span className="text-text-primary block font-mono font-semibold tracking-tight">{r.reference}</span>
          {r.claim_ref && <span className={sub}>Claim {r.claim_ref}</span>}
        </span>,
        <span key="partner" className="block">
          <span className="text-text-primary block truncate font-semibold">{row.orgName ?? "Partner"}</span>
          {row.requesterName && <span className={sub}>{row.requesterName}</span>}
        </span>,
        <span key="property" className="block">
          <span className="text-text-primary block truncate">{row.propertyName}</span>
          {row.suburb && <span className={sub}>{row.suburb}</span>}
        </span>,
        <span key="stay" className="block">
          <span className="text-text-primary block tabular-nums">
            {formatDayMonth(r.check_in)} – {formatDayMonth(r.check_out)}
          </span>
          {row.suburb && <span className={cn(sub, "hidden lg:block xl:hidden")}>{row.suburb}</span>}
          <span className={sub}>
            {r.nights} {r.nights === 1 ? "night" : "nights"} · {guests} {guests === 1 ? "guest" : "guests"}
            {r.guests_pets > 0 && ` · ${r.guests_pets} ${r.guests_pets === 1 ? "pet" : "pets"}`}
          </span>
        </span>,
        <span key="total" className="text-text-primary font-semibold tabular-nums">
          {r.total_cents != null ? money(r.total_cents) : "—"}
        </span>,
      ],
      // Approve and Decline on the row (usability task e looked for Decline here first);
      // Counter-offer and Assign wait in the details. No Approve until the card is held.
      actions: mayDecide ? (
        <div className="flex gap-2 max-lg:[&>*]:flex-1">
          {row.gate.ok && (
            <ApproveAction
              r={r}
              mode={row.mode}
              gate={row.gate}
              notifies={who}
              size="sm"
              className="w-full lg:w-auto"
              returnTo={QUEUE}
            />
          )}
          <DeclineAction r={r} notifies={who} size="sm" className="w-full lg:w-auto" returnTo={QUEUE} />
        </div>
      ) : null,
      details: (
        <div className="space-y-5">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <section aria-label="Quote">
              <h3 className="eyebrow mb-2">Quote</h3>
              {row.quote ? (
                <QuoteLines
                  lines={row.quote.lines}
                  totalCents={row.quote.totalCents}
                  depositCents={row.quote.depositCents}
                  currency={r.currency}
                  nights={r.nights}
                  compact
                />
              ) : (
                <p className="text-text-muted text-body-sm">No quote on file.</p>
              )}
            </section>
            <section aria-label="Partner history" className="text-body-sm space-y-1">
              <h3 className="eyebrow mb-2">{row.orgName ?? "Partner"}</h3>
              <p className="text-text-primary">
                {earlier <= 0
                  ? "First request from this partner."
                  : `${earlier} earlier ${earlier === 1 ? "request" : "requests"}: ${h.confirmed} confirmed, ${h.declined} declined, ${h.cancelled} cancelled.`}
              </p>
              <p className="text-text-secondary">
                {row.mode === "invoice"
                  ? "Pays on invoice."
                  : row.mode === "deposit"
                    ? "Pays a deposit by card."
                    : "Pays by card."}{" "}
                {row.mode !== "invoice" && (row.gate.ok ? "Card held." : (row.gate.reason ?? ""))}
              </p>
              {r.po_number && <p className="text-text-secondary">PO {r.po_number}</p>}
            </section>
            <section aria-label="Guest" className="text-body-sm space-y-1">
              <h3 className="eyebrow mb-2">Guest</h3>
              <p className="text-text-primary">{r.guest_name ?? "Not given yet"}</p>
              <p className="text-text-secondary">
                {r.guests_adults} {r.guests_adults === 1 ? "adult" : "adults"}
                {r.guests_children > 0 && `, ${r.guests_children} ${r.guests_children === 1 ? "child" : "children"}`}
                {r.guests_pets > 0 && `, ${r.guests_pets} ${r.guests_pets === 1 ? "pet" : "pets"}`}
              </p>
              {r.submitted_at && <p className="text-text-muted">Sent {formatWhen(r.submitted_at, now)}</p>}
            </section>
          </div>
          <div className="border-subtle flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center">
            {mayDecide && (
              <>
                <CounterAction r={r} today={today} size="sm" className="w-full sm:w-auto" returnTo={QUEUE} />
                {r.status === "SUBMITTED" && (
                  <AssignAction
                    id={r.id}
                    size="sm"
                    className="w-full sm:w-auto"
                    returnTo={QUEUE}
                    reference={r.reference}
                  />
                )}
              </>
            )}
            <Link
              href={`/admin/bookings/${r.id}`}
              className={cn(buttonVariants({ variant: "tertiary", size: "sm" }), "w-full sm:ml-auto sm:w-auto")}
            >
              Open full request
            </Link>
          </div>
        </div>
      ),
    };
  });

  const ref = str(sp.ref);
  const empty = data.rows.length === 0 && !hasActiveFilters(params);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Operations</p>
          <h1 className="text-h1 text-text-primary font-serif tracking-tight">Request queue</h1>
          <p className="text-text-secondary text-body mt-1" data-live="queue-subtitle">
            {queueSubtitle(counts, now, formatDuration)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <SyncState model={shell.sync} audience="ops" />
          <Freshness renderedAt={now.toISOString()} />
        </div>
      </header>

      <Flash audience="ops" toast done={str(sp.done)} error={str(sp.error)} detail={str(sp.detail)} subject={ref} />

      {empty ? (
        <div className="border-subtle bg-surface rounded-card border">
          <EmptyState
            icon={CheckCircle2}
            title="Nothing waiting on Live Luxe"
            body={
              <>
                New requests appear here the moment a partner sends them, most urgent first.
                {data.lastDecisionAt && <> Last decision {formatWhen(data.lastDecisionAt, now)}.</>}
              </>
            }
            action={
              <Link href="/admin/bookings" className={buttonVariants({ variant: "secondary" })}>
                See all bookings
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <nav aria-label="Queue views">
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {QUEUE_VIEWS.map((v) => {
                const active = view === v;
                const n = counts[v];
                const alarm = v === "breached" && n > 0;
                return (
                  <li key={v}>
                    <Link
                      href={viewHref(active ? null : v)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "rounded-card bg-surface border-subtle focus-visible:outline-focus block h-full border px-4 py-3 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2",
                        "hover:border-strong-border",
                        alarm && "border-danger-border bg-danger-bg",
                        active && "ring-navy dark:ring-gold ring-2",
                      )}
                    >
                      <span
                        className={cn("text-body-sm font-semibold", alarm ? "text-danger-fg" : "text-text-secondary")}
                      >
                        {QUEUE_VIEW_LABELS[v]}
                      </span>
                      <span
                        className={cn(
                          "text-h1 mt-1 block font-semibold tabular-nums",
                          alarm ? "text-danger-fg" : "text-text-primary",
                        )}
                      >
                        {n}
                      </span>
                      <span className="text-text-muted text-body-sm block">{VIEW_HINT[v]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="space-y-3">
            <ListFilters
              action={QUEUE}
              params={params}
              orgs={orgs}
              carry={{ view: view ?? undefined }}
              clearHref={QUEUE}
            />
            {filtered && (
              <p className="text-text-secondary text-body-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Showing {items.length} of {data.rows.length}
                  {view && <> · {QUEUE_VIEW_LABELS[view]}</>}
                  {params.orgId && <> · {orgs.find((o) => o.id === params.orgId)?.name ?? "one partner"}</>}
                  {params.q && <> · “{params.q}”</>}
                </span>
                <Link href={QUEUE} className="text-text-primary font-semibold underline underline-offset-4">
                  Clear all
                </Link>
              </p>
            )}
          </div>

          {items.length === 0 ? (
            <div className="border-subtle bg-surface rounded-card border">
              <EmptyState
                icon={SearchX}
                title="No requests in this view"
                body={
                  view === "breached" ? "Nothing is past its deadline." : "Try another view, partner or search term."
                }
                action={
                  <Link href={QUEUE} className={buttonVariants({ variant: "secondary" })}>
                    Show the whole queue
                  </Link>
                }
              />
            </div>
          ) : (
            <QueueList items={items} />
          )}
        </>
      )}
    </div>
  );
}
