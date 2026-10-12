import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { AgendaEntry } from "@/lib/domain/dashboard";
import { Panel, PanelHeading } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

/** This week: 7-day vertical agenda of arrivals (navy) and departures (muted). */
export function Agenda({ entries }: { entries: AgendaEntry[] }) {
  return (
    <Panel flush aria-labelledby="agenda-heading">
      <PanelHeading id="agenda-heading" title="This week" flush />
      {entries.length === 0 ? (
        <p className="text-muted-foreground px-5 py-8 text-center text-sm">
          No arrivals or departures in the next 7 days.
        </p>
      ) : (
        <ol className="divide-border divide-y">
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
                    className={cn("w-16 shrink-0 text-xs", newDay ? "text-strong font-medium" : "text-transparent")}
                    aria-hidden={!newDay}
                  >
                    {e.dayLabel}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      In ? "bg-primary text-primary-foreground" : "bg-sunken text-muted-foreground",
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
                    <span className="text-strong font-medium">{e.guestSurname}</span>
                    <span className="text-foreground"> · {e.propertyName}</span>
                    {e.suburb && <span className="text-muted-foreground">, {e.suburb}</span>}
                    {e.accessNote && (
                      <span
                        className={cn(
                          "block text-xs",
                          e.accessNote.startsWith("Access") ? "text-ok" : "text-muted-foreground",
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
    </Panel>
  );
}
