import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ListPagination } from "@/components/ui/list-pagination";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Flash } from "@/components/requests/flash";
import { Freshness } from "@/components/requests/freshness";
import { ListFilters } from "@/components/requests/list-filters";
import { RequestsTable } from "@/components/requests/requests-table";
import { FILTERABLE_BANDS, hasActiveFilters, listQueryString, parseListParams } from "@/lib/domain/list-params";
import { listOrgOptions } from "@/lib/partners/load";
import { listQueue } from "@/lib/requests/load";
import { cn } from "@/lib/utils";

export const metadata = { title: "Request queue" };
export const dynamic = "force-dynamic";

const BAND_LABEL = {
  breached: "overdue",
  at_risk: "at risk",
  on_track: "on track",
  paused: "waiting on partner",
} as const;
const BAND_TONE: Record<keyof typeof BAND_LABEL, PillTone> = {
  breached: "bad",
  at_risk: "warn",
  on_track: "ok",
  paused: "muted",
};

/**
 * Primary ops screen (§13.4). Sorted by decision_due_at ascending (urgency, not age)
 * with on-track / at-risk / breached bands. The band pills are both the tally and the
 * filter; partner and search filters run in the database. The list refreshes itself
 * once a minute while the tab is open.
 */
export default async function QueuePage({ searchParams }: PageProps<"/admin/queue">) {
  const sp = await searchParams;
  const params = parseListParams(sp);
  const [queue, orgs] = await Promise.all([listQueue(params), listOrgOptions()]);
  const renderedAt = new Date().toISOString();
  const href = (patch: Partial<typeof params>) => `/admin/queue${listQueryString({ ...params, ...patch })}`;
  const filtered = hasActiveFilters(params);
  const bandTotal = Object.values(queue.bandCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Request queue"
        description={
          bandTotal === 0 && !filtered
            ? "Nothing waiting on Live Luxe."
            : `${bandTotal} ${bandTotal === 1 ? "request" : "requests"} waiting, ordered by decision deadline.`
        }
        actions={<Freshness renderedAt={renderedAt} />}
      />
      <Flash error={Array.isArray(sp.error) ? sp.error[0] : sp.error} />

      <div className="space-y-3">
        <ListFilters
          action="/admin/queue"
          params={params}
          orgs={orgs}
          carry={{ band: params.band ?? undefined }}
          clearHref="/admin/queue"
        />
        {bandTotal > 0 && (
          <ul className="flex flex-wrap items-center gap-2" aria-label="Filter by SLA band">
            {FILTERABLE_BANDS.map((band) => {
              const n = queue.bandCounts[band];
              const active = params.band === band;
              if (n === 0 && !active) return null;
              return (
                <li key={band}>
                  <Link
                    href={href({ band: active ? null : band, page: 1 })}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "focus-visible:ring-ring ring-offset-background inline-flex rounded-full transition-shadow focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                      active && "ring-primary ring-2 ring-offset-2",
                    )}
                  >
                    <Pill tone={BAND_TONE[band]} className="px-2.5 py-1">
                      {n} {BAND_LABEL[band]}
                    </Pill>
                  </Link>
                </li>
              );
            })}
            {params.band && (
              <li>
                <Link
                  href={href({ band: null, page: 1 })}
                  className="text-muted-foreground hover:text-strong text-xs underline-offset-4 hover:underline"
                >
                  Show all bands
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>

      <RequestsTable
        rows={queue.rows}
        ops
        hrefFor={(r) => `/admin/bookings/${r.id}`}
        emptyTitle={filtered ? "No requests match those filters" : "The queue is empty"}
        emptyHint={
          filtered
            ? "Try a different partner or search term, or clear the filters."
            : "Partner requests appear here the moment they are submitted, ordered by decision deadline."
        }
      />
      <ListPagination
        page={queue}
        noun="request"
        hrefFor={(p) => href({ page: p })}
        sizeHrefFor={(s) => href({ pageSize: s as 25 | 50 | 100, page: 1 })}
      />
    </div>
  );
}
