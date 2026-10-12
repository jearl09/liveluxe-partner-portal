import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Quick search: start a search without leaving the page. GET form → /search keeps state in the URL (§13.2). */
export function QuickSearch({ lastSuburb }: { lastSuburb: string | null }) {
  const input = "border-cream-300 h-10 w-full rounded-md border bg-white px-3 text-sm";
  return (
    <section
      aria-labelledby="quick-search-heading"
      className="bg-cream-100 border-cream-200 rounded-lg border p-5 md:p-6"
    >
      <h2 id="quick-search-heading" className="font-serif text-xl">
        Quick search
      </h2>
      <form action="/search" method="get" className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
        <label className="block text-xs font-medium">
          Suburb or postcode
          <input
            name="q"
            defaultValue={lastSuburb ?? ""}
            placeholder="Docklands"
            className={`${input} mt-1`}
            autoComplete="off"
          />
        </label>
        <label className="block text-xs font-medium">
          Check-in
          <input name="checkIn" type="date" className={`${input} mt-1`} />
        </label>
        <label className="block text-xs font-medium">
          Check-out
          <input name="checkOut" type="date" className={`${input} mt-1`} />
        </label>
        <label className="block text-xs font-medium">
          Guests
          <input name="guests" type="number" min={1} max={16} defaultValue={2} className={`${input} mt-1`} />
        </label>
        <Button type="submit" className="h-10">
          <Search className="h-4 w-4" aria-hidden /> Search
        </Button>
      </form>
    </section>
  );
}
