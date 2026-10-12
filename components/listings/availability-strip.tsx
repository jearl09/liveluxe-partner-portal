import { addDays } from "@/lib/domain/dates";
import { buildStripMonths, summariseStrip, type StripDay } from "@/lib/domain/search";
import { formatMoney } from "@/lib/domain/money";
import { cn, formatDate, formatDayMonth } from "@/lib/utils";

const WEEKDAYS = [
  ["M", "Monday"],
  ["T", "Tuesday"],
  ["W", "Wednesday"],
  ["T", "Thursday"],
  ["F", "Friday"],
  ["S", "Saturday"],
  ["S", "Sunday"],
] as const;

const hatched = "bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--cream-200)_3px_4px)]";

/** Status in words, plus the nightly rate when the night is open and priced. */
function describe(d: StripDay, currency: string): { word: string; price: string | null } {
  if (!d.known) return { word: "not synced yet", price: null };
  if (!d.available) return { word: "booked or blocked", price: null };
  return { word: "open", price: d.priceCents ? formatMoney(d.priceCents, currency) : null };
}

/**
 * The next 90 nights as month calendars (§13.3). A partner placing a long stay needs
 * actual dates — "open from the 16th" — not a count of dots. State is carried by the
 * cell's form as well as its colour (§13.5): booked nights are struck through,
 * unsynced nights are hatched, and today is ringed in gold.
 */
export function AvailabilityStrip({
  days,
  currency,
  today,
}: {
  days: StripDay[];
  currency: string;
  /** Property-local ISO date; the cell is ringed so the eye finds the start of the window. */
  today: string;
}) {
  const months = buildStripMonths(days);
  const summary = summariseStrip(days);

  const title = (d: StripDay) => {
    const s = describe(d, currency);
    return `${formatDate(d.date)} · ${s.word}${s.price ? ` · ${s.price}` : ""}`;
  };

  return (
    <section aria-labelledby="availability-heading" className="space-y-4">
      <div>
        <h2 id="availability-heading" className="font-serif text-xl">
          Next 90 days
        </h2>
        <p className="text-foreground mt-1 text-sm">
          {summary.open === 0 ? (
            "No open nights in this window."
          ) : (
            <>
              <span className="text-strong font-medium">{summary.open}</span> of {summary.total} nights open.
              {/* Shown as check-in → check-out, the same convention as every stay in the portal. */}
              {summary.longestRun && summary.longestRun.nights > 1 && (
                <>
                  {" "}
                  Longest open stretch:{" "}
                  <span className="text-strong font-medium">{summary.longestRun.nights} nights</span>,{" "}
                  {formatDayMonth(summary.longestRun.start)} → {formatDayMonth(addDays(summary.longestRun.end, 1))}.
                </>
              )}
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-6 gap-y-5">
        {months.map((m) => (
          <table key={m.key} className="w-full table-fixed border-separate border-spacing-0.5 self-start">
            <caption className="text-strong mb-1.5 text-left text-sm font-medium">{m.label}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map(([letter, name]) => (
                  <th key={name} scope="col" className="text-muted-foreground h-6 text-center text-[11px] font-normal">
                    <abbr title={name} className="no-underline">
                      {letter}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map((d, di) =>
                    d ? (
                      <td
                        key={d.date}
                        title={title(d)}
                        className={cn(
                          "h-6.5 rounded-[3px] border text-center text-xs tabular-nums",
                          d.known && d.available && "text-strong border-border bg-card",
                          d.known && !d.available && "text-muted-foreground bg-sunken border-border line-through",
                          !d.known && `text-muted-foreground border-border ${hatched}`,
                          d.date === today && "shadow-[inset_0_0_0_1.5px_var(--gold-500)]",
                        )}
                      >
                        <span aria-hidden>{Number(d.date.slice(8, 10))}</span>
                        <span className="sr-only">
                          {title(d).replace(/ · /g, ", ")}
                          {d.date === today ? ", today" : ""}
                        </span>
                      </td>
                    ) : (
                      <td key={`blank-${di}`} className="h-6.5" aria-hidden />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      <ul className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1.5 text-xs" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="border-border bg-card inline-block h-4 w-4 rounded-[3px] border" aria-hidden /> Open
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="bg-sunken border-border inline-flex h-4 w-4 items-center justify-center rounded-[3px] border"
            aria-hidden
          >
            <span className="bg-muted-foreground/60 block h-px w-2" />
          </span>
          Booked or blocked
        </li>
        <li className="flex items-center gap-1.5">
          <span className={cn("border-border inline-block h-4 w-4 rounded-[3px] border", hatched)} aria-hidden /> Not
          synced yet
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="border-border bg-card inline-block h-4 w-4 rounded-[3px] border shadow-[inset_0_0_0_1.5px_var(--gold-500)]"
            aria-hidden
          />{" "}
          Today
        </li>
      </ul>
    </section>
  );
}
