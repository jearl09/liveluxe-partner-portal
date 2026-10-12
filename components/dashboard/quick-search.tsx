import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";

/** Quick search: start a search without leaving the page. GET form → /search keeps state in the URL (§13.2). */
export function QuickSearch({ lastSuburb }: { lastSuburb: string | null }) {
  return (
    <section aria-labelledby="quick-search-heading" className="bg-muted border-border rounded-lg border p-5 md:p-6">
      <h2 id="quick-search-heading" className="font-serif text-xl">
        Quick search
      </h2>
      <form action="/search" method="get" className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
        <label className={labelClass}>
          Suburb or postcode
          <input
            name="q"
            defaultValue={lastSuburb ?? ""}
            placeholder="Docklands"
            className={`${fieldClass} mt-1`}
            autoComplete="off"
          />
        </label>
        <label className={labelClass}>
          Check-in
          <input name="checkIn" type="date" className={`${fieldClass} mt-1`} />
        </label>
        <label className={labelClass}>
          Check-out
          <input name="checkOut" type="date" className={`${fieldClass} mt-1`} />
        </label>
        <label className={labelClass}>
          Guests
          <input name="guests" type="number" min={1} max={16} defaultValue={2} className={`${fieldClass} mt-1`} />
        </label>
        <Button type="submit">
          <Search className="h-4 w-4" aria-hidden /> Search
        </Button>
      </form>
    </section>
  );
}
