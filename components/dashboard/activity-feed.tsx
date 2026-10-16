import Link from "next/link";
import { Panel, PanelHeading } from "@/components/ui/panel";
import type { ActivityEvent } from "@/lib/dashboard/types";

/** Recent activity: the five latest events, so the column ends near the requests beside it. Every timestamp carries its timezone; UTC on hover. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <Panel flush aria-labelledby="activity-heading">
      <PanelHeading id="activity-heading" title="Recent activity" flush />
      {events.length === 0 ? (
        <p className="text-muted-foreground px-5 py-8 text-center text-sm">
          Decisions, comments and invoices will show here.
        </p>
      ) : (
        <ol className="divide-border divide-y">
          {events.slice(0, 5).map((e) => (
            <li key={e.id} className="px-5 py-3 text-sm">
              <p className="text-strong">
                {e.verb}
                {e.reference && (
                  <>
                    {" "}
                    on{" "}
                    {e.requestId ? (
                      <Link
                        href={`/requests/${e.requestId}`}
                        className="font-mono text-xs underline underline-offset-2"
                      >
                        {e.reference}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">{e.reference}</span>
                    )}
                  </>
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                <time dateTime={e.atIso} title={`${e.atUtc} (UTC)`}>
                  {e.atLabel}
                </time>
                {e.actor && <> by {e.actor}</>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
