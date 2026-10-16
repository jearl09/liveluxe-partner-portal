"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { addDays } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { buildStripMonths, summariseStrip, type StripDay } from "@/lib/domain/search";
import { blockText, dayBlock, type NightState, type StayCalendar } from "@/lib/domain/stay-picker";
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

/**
 * How each night looks. Every state differs in form as well as colour (§13.5): open nights are white with dark
 * numerals, booked nights are filled and struck through, nights not synced yet are hatched with no numeral weight,
 * and nights without a price carry a dashed edge.
 */
const NIGHT_CELL: Record<NightState, string> = {
  open: "bg-surface border-strong-border text-text-primary font-semibold",
  booked: "bg-muted-bg border-muted-border text-text-muted line-through decoration-text-muted",
  unsynced:
    "border-subtle text-text-muted bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--border-subtle)_3px_4.5px)]",
  unpriced: "bg-surface border-dashed border-strong-border text-text-secondary",
};
const NIGHT_WORD: Record<NightState, string> = {
  open: "open",
  booked: "booked",
  unsynced: "not available yet",
  unpriced: "price on application",
};
const TODAY_RING = "shadow-[inset_0_0_0_2px_var(--accent-gold)]";

/**
 * The next 90 nights as month calendars (brief §7.4), and a way to pick a stay: choose a check-in, then a check-out,
 * and the page prices it. Same rules and data as the date picker in the price panel (`lib/domain/stay-picker`): a
 * booked day can be the check-out (the guest leaves that morning), every night in between must be open, and the
 * stay must meet the minimum and maximum. A day that cannot be chosen says why on hover and to a screen reader.
 *
 * Keyboard (brief §10.2, roving focus): the calendar is one tab stop. Arrow keys move a day (up and down a week),
 * Home and End go to the start and end of the week, skipping days that cannot be chosen; Enter or Space picks.
 */
export function AvailabilityStrip({
  cal,
  count,
  currency,
  today,
  selected,
  conflicts = [],
}: {
  cal: StayCalendar;
  /** How many nights to show from `cal.from`. */
  count: number;
  currency: string;
  /** Property-local ISO date; ringed so the eye finds the start of the window. */
  today: string;
  /** The stay in the price panel, highlighted here. */
  selected?: { checkIn: string; checkOut: string } | null;
  /** Nights the server refused for the selected stay (DATES_UNAVAILABLE), marked in the danger colour. */
  conflicts?: string[];
}) {
  const nights = cal.nights.slice(0, count);
  const asStrip: StripDay[] = nights.map((n) => ({
    date: n.date,
    known: n.state !== "unsynced",
    available: n.state === "open",
    priceCents: n.priceCents,
  }));
  const months = buildStripMonths(asStrip);
  const summary = summariseStrip(asStrip);
  const byDate = new Map(nights.map((n) => [n.date, n]));
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [start, setStart] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonFor = (date: string) => {
    const r = dayBlock(cal, date, start);
    return r ? blockText(r) : null;
  };
  const selectable = (date: string) => reasonFor(date) === null;
  const choose = (date: string) => {
    if (!selectable(date)) return;
    if (start && date > start) {
      const next = new URLSearchParams(params.toString());
      next.set("checkIn", start);
      next.set("checkOut", date);
      setStart(null);
      startTransition(() => router.push(`${pathname}?${next.toString()}#price`, { scroll: false }));
      return;
    }
    setStart(date);
  };
  const inSelected = (date: string) => !start && !!selected && date >= selected.checkIn && date < selected.checkOut;
  const firstSelectable = nights.find((n) => selectable(n.date))?.date ?? null;
  const [cursor, setCursor] = useState<string | null>(null);
  // The one tab stop: where the arrows last left it, else the chosen check-in, else the first day that can be picked.
  const rover = cursor && byDate.has(cursor) && selectable(cursor) ? cursor : (start ?? firstSelectable);
  const grid = useRef<HTMLDivElement>(null);

  const moveTo = (from: string, step: number, limit: string | null = null) => {
    for (let x = addDays(from, step), i = 0; i < count + 2; x = addDays(x, step), i++) {
      if (limit && (step > 0 ? x > limit : x < limit)) return;
      if (!byDate.has(x)) return;
      if (selectable(x)) {
        setCursor(x);
        grid.current?.querySelector<HTMLButtonElement>(`button[data-date="${x}"]`)?.focus();
        return;
      }
    }
  };
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = (e.target as HTMLElement).dataset?.date;
    if (!from) return;
    const dow = (new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const keys: Record<string, () => void> = {
      ArrowRight: () => moveTo(from, 1),
      ArrowLeft: () => moveTo(from, -1),
      ArrowDown: () => moveTo(from, 7),
      ArrowUp: () => moveTo(from, -7),
      Home: () => moveTo(addDays(from, -dow - 1), 1, from),
      End: () => moveTo(addDays(from, 7 - dow), -1, from),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  };

  const label = (date: string) => {
    const n = byDate.get(date)!;
    const price = n.state === "open" && n.priceCents ? `, ${formatMoney(n.priceCents, currency)}` : "";
    return `${formatDate(date)}, ${NIGHT_WORD[n.state]}${price}`;
  };

  return (
    <section aria-labelledby="availability-heading" className="space-y-4">
      <div>
        <h2 id="availability-heading">Availability, next {count} days</h2>
        <p className="text-text-secondary text-body mt-1">
          {summary.open === 0 ? (
            "No open nights in this window."
          ) : (
            <>
              <span className="text-text-primary font-semibold">{summary.open}</span> of {summary.total} nights open.
              {/* Shown as check-in → check-out, the same convention as every stay in the portal. */}
              {summary.longestRun && summary.longestRun.nights > 1 && (
                <>
                  {" "}
                  Longest open stretch:{" "}
                  <span className="text-text-primary font-semibold">{summary.longestRun.nights} nights</span>,{" "}
                  {formatDayMonth(summary.longestRun.start)} → {formatDayMonth(addDays(summary.longestRun.end, 1))}.
                </>
              )}
            </>
          )}
        </p>
      </div>

      <p className="text-text-secondary text-body-sm" aria-live="polite">
        {pending
          ? "Pricing your stay…"
          : start
            ? `Check-in ${formatDayMonth(start)}. Now choose the check-out day.`
            : "Choose a check-in day, then a check-out day, to price that stay."}
        {start && !pending && (
          <button
            type="button"
            onClick={() => setStart(null)}
            className="text-text-primary ml-2 font-semibold underline underline-offset-4"
          >
            Start again
          </button>
        )}
      </p>

      <div
        ref={grid}
        onKeyDown={onGridKey}
        className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-x-6 gap-y-5"
      >
        {months.map((m) => (
          <table key={m.key} className="w-full table-fixed border-separate border-spacing-0.5 self-start">
            <caption className="text-text-primary text-body-sm mb-1.5 text-left font-semibold">{m.label}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map(([letter, name]) => (
                  <th key={name} scope="col" className="text-text-muted text-body-sm h-6 text-center font-normal">
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
                  {week.map((d, di) => {
                    if (!d) return <td key={`blank-${di}`} className="h-8" aria-hidden />;
                    const n = byDate.get(d.date)!;
                    const reason = reasonFor(d.date);
                    const isStart = d.date === start || (!start && selected?.checkIn === d.date);
                    const isEnd = !start && selected?.checkOut === d.date;
                    const conflict = conflicts.includes(d.date);
                    return (
                      <td
                        key={d.date}
                        aria-selected={isStart || isEnd || undefined}
                        className={cn(
                          "text-body-sm h-8 rounded-[4px] border text-center tabular-nums",
                          NIGHT_CELL[n.state],
                          inSelected(d.date) && n.state === "open" && "bg-inset",
                          d.date === today && TODAY_RING,
                          (isStart || isEnd) && "bg-gold text-on-gold border-gold no-underline",
                          conflict && "border-danger-fg bg-danger-bg text-danger-fg",
                        )}
                      >
                        <button
                          type="button"
                          data-date={d.date}
                          tabIndex={d.date === rover ? 0 : -1}
                          onFocus={() => setCursor(d.date)}
                          onClick={() => choose(d.date)}
                          aria-disabled={reason || pending ? true : undefined}
                          title={reason ?? label(d.date)}
                          className={cn(
                            "focus-visible:outline-focus coarse:min-h-10 h-full w-full rounded-[4px] focus-visible:outline-2",
                            reason ? "cursor-not-allowed" : "hover:ring-strong-border hover:ring-1",
                          )}
                        >
                          <span aria-hidden>{Number(d.date.slice(8, 10))}</span>
                          <span className="sr-only">
                            {!reason && start && d.date > start ? "Check out " : !reason ? "Check in " : ""}
                            {label(d.date)}
                            {d.date === today ? ", today" : ""}
                            {conflict ? ", not available for your dates" : ""}
                            {reason ? `. ${reason}` : ""}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      <ul className="text-text-secondary text-body-sm flex flex-wrap gap-x-5 gap-y-2" aria-label="Legend">
        {(
          [
            ["open", "Open"],
            ["booked", "Booked"],
            ["unsynced", "Not available yet"],
            ["unpriced", "Price on application"],
          ] as const
        ).map(([state, word]) => (
          <li key={state} className="flex items-center gap-2">
            <span
              className={cn(
                "text-body-sm inline-flex h-6 w-7 items-center justify-center rounded-[4px] border",
                NIGHT_CELL[state],
              )}
              aria-hidden
            >
              14
            </span>
            {word}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span
            className={cn(
              "text-body-sm inline-flex h-6 w-7 items-center justify-center rounded-[4px] border",
              NIGHT_CELL.open,
              TODAY_RING,
            )}
            aria-hidden
          >
            14
          </span>
          Today
        </li>
        <li className="flex items-center gap-2">
          <span
            className="bg-gold text-on-gold border-gold text-body-sm inline-flex h-6 w-7 items-center justify-center rounded-[4px] border font-semibold"
            aria-hidden
          >
            14
          </span>
          Your dates
        </li>
      </ul>
    </section>
  );
}
