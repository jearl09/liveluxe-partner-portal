import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { AgendaEntry } from "@/lib/domain/dashboard";
import { cn } from "@/lib/utils";

/** This week: 7-day vertical agenda of arrivals (navy) and departures (muted). */
export function Agenda({ entries }: { entries: AgendaEntry[] }) {
  return (
    <section aria-labelledby="agenda-heading" className="border-cream-200 rounded-lg border bg-white">
      <header className="border-cream-200 border-b px-5 py-4">
        <h2 id="agenda-heading" className="font-serif text-xl">
          This week
        </h2>
      </header>
      {entries.length === 0 ? (
        <p className="text-ink-500 px-5 py-8 text-center text-sm">No arrivals or departures in the next 7 days.</p>
      ) : (
        <ol className="divide-cream-200 divide-y">
          {entries.map((e, i) => {
            const newDay = i === 0 || entries[i - 1]!.dateIso !== e.dateIso;
            const In = e.direction === "in";
            return (
              <li key={`${e.requestId}:${e.direction}`}>
                <Link
                  href={`/requests/${e.requestId}`}
                  className="focus-visible:ring-ring flex gap-3 px-5 py-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                >
                  <span
                    className={cn("w-16 shrink-0 text-xs", newDay ? "text-navy-900 font-medium" : "text-transparent")}
                    aria-hidden={!newDay}
                  >
                    {e.dayLabel}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      In ? "bg-navy-900 text-white" : "bg-cream-200 text-ink-500",
                    )}
                    aria-label={In ? "Check-in" : "Check-out"}
                  >
                    {In ? (
                      <ArrowDownRight className="h-3 w-3" aria-hidden />
                    ) : (
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="text-navy-900 font-medium">{e.guestSurname}</span>
                    <span className="text-ink-700"> · {e.propertyName}</span>
                    {e.suburb && <span className="text-ink-500">, {e.suburb}</span>}
                    {e.accessNote && (
                      <span
                        className={cn(
                          "block text-xs",
                          e.accessNote.startsWith("Access") ? "text-emerald-700" : "text-ink-500",
                        )}
                      >
                        {e.accessNote}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
