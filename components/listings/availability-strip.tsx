import type { StripDay } from "@/lib/domain/search";
import { formatMoney } from "@/lib/domain/money";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * 90-day availability at a glance. Colour is paired with a text legend and each cell
 * carries its date and rate in a tooltip (§13.5: never colour alone).
 */
export function AvailabilityStrip({ days, currency }: { days: StripDay[]; currency: string }) {
  // Group by month for labels.
  const groups: { label: string; days: StripDay[] }[] = [];
  for (const d of days) {
    const label = new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" }).format(
      new Date(`${d.date}T00:00:00Z`),
    );
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.days.push(d);
    else groups.push({ label, days: [d] });
  }
  const available = days.filter((d) => d.available).length;
  return (
    <section aria-labelledby="availability-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="availability-heading" className="font-serif text-lg">
          Next 90 days
        </h2>
        <p className="text-ink-500 text-xs">
          {available} of {days.length} nights open
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-3">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="text-ink-500 mb-1 text-[11px] tracking-wide uppercase">{g.label}</p>
            <ul className="flex flex-wrap gap-1">
              {g.days.map((d) => (
                <li
                  key={d.date}
                  title={`${formatDate(d.date)} · ${
                    !d.known
                      ? "not synced"
                      : d.available
                        ? d.priceCents
                          ? formatMoney(d.priceCents, currency)
                          : "available"
                        : "unavailable"
                  }`}
                  className={cn(
                    "h-4 w-4 rounded-sm border",
                    !d.known &&
                      "border-cream-300 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,#e9e1d2_3px,#e9e1d2_4px)]",
                    d.known && d.available && "border-emerald-300 bg-emerald-100",
                    d.known && !d.available && "border-cream-300 bg-cream-200",
                  )}
                >
                  <span className="sr-only">
                    {formatDate(d.date)}: {!d.known ? "not synced" : d.available ? "available" : "unavailable"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <ul className="text-ink-500 flex flex-wrap gap-4 text-xs" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-emerald-300 bg-emerald-100" aria-hidden /> Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="border-cream-300 bg-cream-200 h-3 w-3 rounded-sm border" aria-hidden /> Booked or blocked
        </li>
        <li className="flex items-center gap-1.5">
          <span className="border-cream-300 h-3 w-3 rounded-sm border" aria-hidden /> Not synced yet
        </li>
      </ul>
    </section>
  );
}
