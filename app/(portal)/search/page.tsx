import Link from "next/link";
import { CalendarDays, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, SyncState } from "@/components/ui/states";
import { ManualSearch } from "@/components/dashboard/manual-search";
import { SectionError } from "@/components/dashboard/section-error";
import { Pagination } from "@/components/search/pagination";
import { ResultCard } from "@/components/search/result-card";
import { SearchForm } from "@/components/search/search-form";
import { SortSelect } from "@/components/search/sort-select";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
import { parseSearchParams, searchQueryString } from "@/lib/domain/search";
import { env } from "@/lib/env";
import { loadSyncState } from "@/lib/listings/sync";
import { nearbyAvailability, searchListings, type SearchResults } from "@/lib/listings/load";
import { log, supportRef } from "@/lib/observability/logger";
import { cn, formatDayMonth } from "@/lib/utils";

export const metadata = { title: "Search" };

const TZ = "Australia/Melbourne";

/**
 * Search (brief §7.3): what can I place someone in, for these dates, near here.
 * The bar sticks under the header; every value is in the URL. With dates, only what
 * is free is shown, with indicative pricing; without, the portfolio and a prompt to
 * add dates. Nothing free is never a bare zero: nearby dates, the wider area and the
 * manual search request come next.
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const today = todayIn(TZ);
  const parsed = parseSearchParams(params, today);
  const { query } = parsed;
  const now = new Date();

  const supabase = await createServerSupabase();
  const claims = await getSessionClaims();
  const [sync, orgRes] = await Promise.all([
    loadSyncState(now),
    claims?.org_id
      ? supabase.from("partner_orgs").select("name").eq("id", claims.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const orgName = orgRes.data?.name ?? "";

  let results: SearchResults | null = null;
  let failRef: string | null = null;
  try {
    results = await searchListings(query, parsed.nights, parsed.hasDates);
  } catch (e) {
    failRef = supportRef();
    log.error("search.failed", { ref: failRef, error: e instanceof Error ? e.message : String(e) });
  }
  const none = !!results && results.total === 0;
  const nearby = none && parsed.hasDates ? await nearbyAvailability(query, parsed.nights, today).catch(() => []) : [];

  const linkFor = (id: string) => `/listings/${id}${searchQueryString({ ...query, sort: undefined, page: 1 })}`;
  const pageHref = (p: number) => `/search${searchQueryString({ ...query, page: p })}`;
  const priced = results?.items.filter((i) => !i.price || i.price.quotable) ?? [];
  const onApplication = results?.items.filter((i) => i.price && !i.price.quotable) ?? [];
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-h1 text-text-primary font-serif tracking-tight">Find a property</h1>
          <p className="text-text-secondary text-body mt-1">Live availability across the Live Luxe portfolio.</p>
        </div>
        <SyncState model={sync} audience="partner" />
      </header>

      <div className="border-subtle bg-surface rounded-card border p-4 md:p-5 lg:sticky lg:top-16 lg:z-20 lg:shadow-sm">
        <SearchForm query={query} today={today} />
      </div>

      {parsed.errors.length > 0 && (
        <div role="alert" className="border-danger-border bg-danger-bg text-danger-fg rounded-card border px-4 py-3">
          {parsed.errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {failRef && <SectionError what="search results" refCode={failRef} />}

      {results && !none && (
        <section aria-labelledby="results-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" className="text-h3 font-sans font-semibold" aria-live="polite">
              {parsed.hasDates ? (
                <>
                  {n(results.total, "property", "properties")} available {formatDayMonth(query.checkIn!)} →{" "}
                  {formatDayMonth(query.checkOut!)}
                  <span className="text-text-secondary font-normal"> · {n(parsed.nights, "night", "nights")}</span>
                </>
              ) : (
                <>
                  {n(results.total, "property", "properties")} in the portfolio
                  <span className="text-text-secondary text-body flex items-center gap-1.5 font-normal">
                    <CalendarDays className="text-text-gold h-4 w-4" aria-hidden /> Add dates to see availability and
                    pricing.
                  </span>
                </>
              )}
            </h2>
            <SortSelect value={query.sort ?? "best"} hasDates={parsed.hasDates} />
          </div>

          {priced.length > 0 && (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {priced.map((item, i) => (
                <ResultCard key={item.id} item={item} href={linkFor(item.id)} nights={parsed.nights} eager={i < 3} />
              ))}
            </ul>
          )}

          {onApplication.length > 0 && (
            <section aria-labelledby="poa-heading" className="space-y-3 pt-2">
              <div>
                <h3 id="poa-heading" className="text-h3 font-sans font-semibold">
                  Price on application
                </h3>
                <p className="text-text-secondary">
                  Free for your dates, but some nights are not priced yet. Open one and Live Luxe will quote it.
                </p>
              </div>
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {onApplication.map((item, i) => (
                  <ResultCard
                    key={item.id}
                    item={item}
                    href={linkFor(item.id)}
                    nights={parsed.nights}
                    eager={priced.length === 0 && i < 3}
                  />
                ))}
              </ul>
            </section>
          )}

          <Pagination page={results.page} pages={results.pages} hrefFor={pageHref} />
        </section>
      )}

      {none && (
        <section aria-labelledby="none-heading" className="border-subtle bg-surface rounded-card border">
          <EmptyState
            icon={SearchX}
            title={parsed.hasDates ? "Nothing free for those exact dates" : "No properties match"}
            body={
              parsed.hasDates
                ? nearby.length > 0
                  ? "These nearby dates have room for the same length of stay:"
                  : "Nothing is free a few days either side either. Try fewer guests or a wider area, or ask us to search."
                : "Check the spelling of the suburb, or clear it to see the whole portfolio."
            }
          />
          {nearby.length > 0 && (
            <ul className="-mt-6 flex flex-wrap justify-center gap-2 px-6 pb-8">
              {nearby.map((w) => (
                <li key={w.checkIn}>
                  <Link
                    href={`/search${searchQueryString({ ...query, checkIn: w.checkIn, checkOut: w.checkOut, page: 1 })}`}
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                  >
                    {formatDayMonth(w.checkIn)} → {formatDayMonth(w.checkOut)} · {w.count} free
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-subtle flex flex-wrap items-center justify-between gap-4 border-t px-5 py-4">
            <p className="text-text-secondary max-w-xl">
              {query.q ? (
                <>
                  <Link
                    href={`/search${searchQueryString({ ...query, q: "", page: 1 })}`}
                    className="text-text-primary font-semibold underline underline-offset-4"
                  >
                    Search every suburb
                  </Link>{" "}
                  for these dates, or tell us the household and we will search for you.
                </>
              ) : (
                "Tell us the dates, suburb and household and the operations team will search for you."
              )}
            </p>
            <ManualSearch to={env().EMAIL_REPLY_TO} orgName={orgName} />
          </div>
        </section>
      )}

      {results && !none && (
        <section
          aria-labelledby="manual-heading"
          className="border-subtle bg-surface rounded-card flex flex-wrap items-center justify-between gap-4 border px-5 py-5"
        >
          <div className="max-w-xl">
            <h2 id="manual-heading">Can&apos;t find the right property?</h2>
            <p className="text-text-secondary mt-1">
              Tell us the dates, suburb and household and the operations team will search for you.
            </p>
          </div>
          <ManualSearch to={env().EMAIL_REPLY_TO} orgName={orgName} />
        </section>
      )}
    </div>
  );
}
