import { Search } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { SearchQuery } from "@/lib/domain/search";
import { fieldClass, labelClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Search bar (§13.2). Plain GET form: every filter lives in the URL so a shortlist is shareable. */
export function SearchForm({ query, today }: { query: SearchQuery; today: string }) {
  return (
    <form
      action="/search"
      method="get"
      className="bg-muted border-border grid gap-3 rounded-lg border p-4 md:grid-cols-6 md:items-end md:p-5 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]"
      role="search"
    >
      {/* Phone: one column. Tablet: two rows (place + dates, then household + button). Desktop: one row. */}
      <label className={cn(labelClass, "md:col-span-2 xl:col-span-1")}>
        Suburb, postcode or name
        <input
          name="q"
          defaultValue={query.q}
          placeholder="Docklands"
          className={`${fieldClass} mt-1`}
          autoComplete="off"
          maxLength={80}
        />
      </label>
      <label className={cn(labelClass, "md:col-span-2 xl:col-span-1")}>
        Check-in
        <input
          name="checkIn"
          type="date"
          min={today}
          defaultValue={query.checkIn ?? ""}
          className={`${fieldClass} mt-1`}
        />
      </label>
      <label className={cn(labelClass, "md:col-span-2 xl:col-span-1")}>
        Check-out
        <input
          name="checkOut"
          type="date"
          min={today}
          defaultValue={query.checkOut ?? ""}
          className={`${fieldClass} mt-1`}
        />
      </label>
      <label className={labelClass}>
        Guests
        <input
          name="guests"
          type="number"
          min={1}
          max={20}
          defaultValue={query.guests}
          className={`${fieldClass} mt-1`}
        />
      </label>
      <label className={labelClass}>
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
      <label className={labelClass}>
        Pets
        <input name="pets" type="number" min={0} max={5} defaultValue={query.pets} className={`${fieldClass} mt-1`} />
      </label>
      <SubmitButton
        pendingLabel="Searching…"
        className="md:col-span-3 md:justify-self-end md:px-6 xl:col-span-1 xl:justify-self-auto"
      >
        <Search className="h-4 w-4" aria-hidden /> Search
      </SubmitButton>
    </form>
  );
}
