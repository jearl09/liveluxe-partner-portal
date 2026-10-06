import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Search" };

/**
 * Primary partner screen (§13.2): split list / sticky map, filters, date range, heat map toggle.
 * Search state is persisted in URL query params so a shortlist is shareable.
 * TODO(phase-2): results from GET /api/listings; map from GET /api/map/points (MapLibre + supercluster).
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const hasFilters = Object.keys(params).length > 0;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Search"
        title="Find a property"
        description="Live availability across the Live Luxe portfolio at your partner rates."
      />
      <div className="grid gap-6 lg:grid-cols-[55%_45%]">
        <section aria-label="Results" className="space-y-3">
          {hasFilters && (
            <p className="text-ink-500 text-sm">
              Filters: <code className="font-mono text-xs">{JSON.stringify(params)}</code>
            </p>
          )}
          <div className="border-cream-200 rounded-xl border bg-white px-5 py-14 text-center">
            <p className="text-navy-900 font-medium">Search arrives in Phase 2</p>
            <p className="text-ink-500 mt-1 text-sm">
              Dates, suburb and household size here; results with partner pricing, 24 per page.
            </p>
          </div>
        </section>
        <aside
          aria-label="Map"
          className="bg-cream-100 border-cream-200 sticky top-4 flex h-[70vh] items-center justify-center rounded-xl border"
        >
          <p className="text-ink-500 text-sm">Map and heat map (MapLibre)</p>
        </aside>
      </div>
    </div>
  );
}
