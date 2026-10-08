import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { FreshnessPill } from "@/components/dashboard/freshness-pill";
import { SectionError } from "@/components/dashboard/section-error";
import { SearchForm } from "@/components/search/search-form";
import { ResultCard } from "@/components/search/result-card";
import { Pagination } from "@/components/search/pagination";
import { createServerSupabase } from "@/lib/db/server";
import { evaluateFreshness } from "@/lib/domain/dashboard";
import { todayIn } from "@/lib/domain/dates";
import { parseSearchParams, searchQueryString } from "@/lib/domain/search";
import { searchListings, type SearchResults } from "@/lib/listings/load";
import { formatDate } from "@/lib/utils";
import { log, supportRef } from "@/lib/observability/logger";

export const metadata = { title: "Search" };

const TZ = "Australia/Melbourne";

/**
 * Primary partner screen (§13.2). Filters live in the URL; results come from the
 * gap-free availability function when dates are given, else the whole catalogue.
 * Map and heat map (MapLibre) follow once a tile key is configured.
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const today = todayIn(TZ);
  const parsed = parseSearchParams(params, today);
  const { query } = parsed;

  const supabase = await createServerSupabase();
  const freshnessRes = await supabase.rpc("availability_freshness");
  const fresh = freshnessRes.data?.[0];
  const freshness = evaluateFreshness(fresh?.last_synced_at ?? null, new Date(), fresh?.stale_after_minutes ?? 30);

  let results: SearchResults | null = null;
  let failRef: string | null = null;
  try {
    results = await searchListings(query, parsed.nights, parsed.hasDates);
  } catch (e) {
    failRef = supportRef();
    log.error("search.failed", { ref: failRef, error: e instanceof Error ? e.message : String(e) });
  }

  const linkFor = (id: string) => `/listings/${id}${searchQueryString({ ...query, page: 1 })}`;
  const pageHref = (p: number) => `/search${searchQueryString({ ...query, page: p })}`;

  const summary = results
    ? parsed.hasDates
      ? `${results.total} ${results.total === 1 ? "property" : "properties"} available ${formatDate(query.checkIn!)} → ${formatDate(query.checkOut!)} · ${parsed.nights} ${parsed.nights === 1 ? "night" : "nights"}`
      : `${results.total} ${results.total === 1 ? "property" : "properties"} in the portfolio`
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Search"
        title="Find a property"
        description="Live availability across the Live Luxe portfolio."
        actions={<FreshnessPill freshness={freshness} />}
      />

      <SearchForm query={query} today={today} />

      {parsed.errors.length > 0 && (
        <ul role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {parsed.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {!parsed.hasDates && parsed.errors.length === 0 && (
        <p className="text-ink-700 bg-cream-50 border-cream-200 flex items-center gap-2 rounded-md border px-4 py-3 text-sm">
          <CalendarDays className="text-gold-600 h-4 w-4 shrink-0" aria-hidden />
          Add check-in and check-out dates to see only what is available, with live nightly rates.
        </p>
      )}

      {failRef && <SectionError what="search results" refCode={failRef} />}

      {results && (
        <section aria-label="Results" className="space-y-4">
          <p className="text-ink-500 text-sm">{summary}</p>
          {results.items.length === 0 ? (
            <div className="border-cream-200 rounded-xl border bg-white px-5 py-14 text-center">
              <p className="text-navy-900 font-medium">
                {parsed.hasDates ? "Nothing available for those dates" : "No properties match"}
              </p>
              <p className="text-ink-500 mx-auto mt-1 max-w-md text-sm">
                {parsed.hasDates
                  ? "Try shifting the dates by a day or two, lowering the guest count, or clearing the suburb filter."
                  : "Check the spelling of the suburb or clear the filters."}
              </p>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {results.items.map((item) => (
                <ResultCard key={item.id} item={item} href={linkFor(item.id)} />
              ))}
            </ul>
          )}
          <Pagination page={results.page} pages={results.pages} hrefFor={pageHref} />
        </section>
      )}
    </div>
  );
}
