import { Search } from "lucide-react";
import { DateRangeField } from "@/components/ui/date-field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { SearchQuery } from "@/lib/domain/search";
import { fieldClass, labelClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * The search bar (brief §7.2, §7.3): one component for the Dashboard and /search, so a
 * query from the Dashboard lands on /search with the URL filled in. A plain GET form:
 * every value lives in the URL, so a shortlist is shareable and Back works.
 *
 * Dates use the range picker, which shows the night count while choosing (§4.5).
 * `compact` (the Dashboard) leaves out pets; the full bar on /search has them.
 */
export function SearchForm({
  query,
  today,
  compact = false,
  className,
}: {
  query: Omit<SearchQuery, "page"> & { page?: number };
  today: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <form
      action="/search"
      method="get"
      role="search"
      aria-label="Find a property"
      className={cn(
        "grid gap-3 md:grid-cols-6 md:items-end",
        compact
          ? "xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.8fr)_6rem_7rem_auto]"
          : "xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.8fr)_6rem_7rem_6rem_auto]",
        className,
      )}
    >
      <label className={cn(labelClass, "md:col-span-3 xl:col-span-1")}>
        Suburb, postcode or name
        <input
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder="Docklands"
          className={`${fieldClass} mt-1`}
          autoComplete="off"
          maxLength={80}
        />
      </label>
      <DateRangeField
        label="Dates"
        defaultFrom={query.checkIn}
        defaultTo={query.checkOut}
        min={today}
        className="md:col-span-3 xl:col-span-1"
      />
      <label className={cn(labelClass, "md:col-span-2 xl:col-span-1")}>
        Guests
        <input
          name="guests"
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          defaultValue={query.guests}
          className={`${fieldClass} mt-1`}
        />
      </label>
      <label className={cn(labelClass, "md:col-span-2 xl:col-span-1")}>
        Bedrooms
        <select name="bedrooms" defaultValue={query.bedrooms ?? ""} className={`${fieldClass} mt-1`}>
          <option value="">Any</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}+
            </option>
          ))}
        </select>
      </label>
      {!compact && (
        <label className={cn(labelClass, "md:col-span-2 xl:col-span-1")}>
          Pets
          <input
            name="pets"
            type="number"
            inputMode="numeric"
            min={0}
            max={5}
            defaultValue={query.pets}
            className={`${fieldClass} mt-1`}
          />
        </label>
      )}
      <SubmitButton
        pendingLabel="Searching…"
        className={cn("w-full md:col-span-2 xl:col-span-1 xl:w-auto xl:px-6", compact && "md:col-span-2")}
      >
        <Search className="h-4 w-4" aria-hidden /> Search
      </SubmitButton>
    </form>
  );
}
