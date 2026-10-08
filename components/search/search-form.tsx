import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchQuery } from "@/lib/domain/search";

const input = "border-cream-300 h-10 w-full rounded-md border bg-white px-3 text-sm";

/** Search bar (§13.2). Plain GET form: every filter lives in the URL so a shortlist is shareable. */
export function SearchForm({ query, today }: { query: SearchQuery; today: string }) {
  return (
    <form
      action="/search"
      method="get"
      className="bg-cream-100 border-cream-200 grid gap-3 rounded-lg border p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] md:items-end md:p-5"
      role="search"
    >
      <label className="block text-xs font-medium">
        Suburb, postcode or name
        <input
          name="q"
          defaultValue={query.q}
          placeholder="Docklands"
          className={`${input} mt-1`}
          autoComplete="off"
          maxLength={80}
        />
      </label>
      <label className="block text-xs font-medium">
        Check-in
        <input name="checkIn" type="date" min={today} defaultValue={query.checkIn ?? ""} className={`${input} mt-1`} />
      </label>
      <label className="block text-xs font-medium">
        Check-out
        <input
          name="checkOut"
          type="date"
          min={today}
          defaultValue={query.checkOut ?? ""}
          className={`${input} mt-1`}
        />
      </label>
      <label className="block text-xs font-medium">
        Guests
        <input name="guests" type="number" min={1} max={20} defaultValue={query.guests} className={`${input} mt-1`} />
      </label>
      <label className="block text-xs font-medium">
        Bedrooms
        <select name="bedrooms" defaultValue={query.bedrooms ?? ""} className={`${input} mt-1`}>
          <option value="">Any</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}+
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium">
        Pets
        <input name="pets" type="number" min={0} max={5} defaultValue={query.pets} className={`${input} mt-1`} />
      </label>
      <Button type="submit" className="h-10">
        <Search className="h-4 w-4" aria-hidden /> Search
      </Button>
    </form>
  );
}
