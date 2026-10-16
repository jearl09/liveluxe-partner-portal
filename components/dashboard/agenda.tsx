import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { AgendaEntry } from "@/lib/domain/dashboard";
import { Panel, PanelHeading } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { PropertyThumb } from "./property-thumb";

/** This week: 7-day vertical agenda of arrivals (navy) and departures (muted). */
export function Agenda({ entries }: { entries: AgendaEntry[] }) {
  return (
    <Panel flush aria-labelledby="agenda-heading">
      <PanelHeading id="agenda-heading" title="This week" flush />
      {entries.length === 0 ? (
        <p className="text-text-muted text-body px-5 py-8 text-center">No arrivals or departures in the next 7 days.</p>
      ) : (
        <ol className="divide-subtle divide-y">
          {entries.map((e, i) => {
            const newDay = i === 0 || entries[i - 1]!.dateIso !== e.dateIso;
            const In = e.direction === "in";
            return (
              <li key={`${e.requestId}:${e.direction}`}>
                <Link
                  href={`/requests/${e.requestId}`}
                  className="focus-visible:ring-focus flex gap-3 px-5 py-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                >
                  <span
                    className={cn(
                      "text-body-sm w-20 shrink-0",
                      newDay ? "text-text-primary font-medium" : "text-transparent",
                    )}
                    aria-hidden={!newDay}
                  >
                    {e.dayLabel}
                  </span>
                  {/* The photo, with the arrival or departure badge on its corner. */}
                  <span className="relative shrink-0 self-start">
                    <PropertyThumb url={e.photoUrl} size={36} />
                    <span
                      className={cn(
                        "ring-surface absolute -right-1.5 -bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full ring-2",
                        In ? "bg-text-primary text-surface" : "bg-inset text-text-muted",
                      )}
                      role="img"
                      aria-label={In ? "Check-in" : "Check-out"}
                    >
                      {In ? (
                        <ArrowDownRight className="h-3 w-3" aria-hidden />
                      ) : (
                        <ArrowUpRight className="h-3 w-3" aria-hidden />
                      )}
                    </span>
                  </span>
                  <span className="text-body min-w-0">
                    <span className="text-text-primary font-medium">{e.guestSurname}</span>
                    <span className="text-text-secondary"> · {e.propertyName}</span>
                    {e.suburb && <span className="text-text-muted">, {e.suburb}</span>}
                    {e.accessNote && (
                      <span
                        className={cn(
                          "text-body-sm block",
                          e.accessNote.endsWith("released") ? "text-success-fg" : "text-text-muted",
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
