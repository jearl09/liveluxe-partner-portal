import Link from "next/link";
import { Panel, PanelHeading } from "@/components/ui/panel";
import type { ActivityEvent } from "@/lib/dashboard/types";

/** Recent activity: the five latest events, so the column ends near the requests beside it. Every timestamp carries its timezone; UTC on hover. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <Panel flush aria-labelledby="activity-heading">
      <PanelHeading id="activity-heading" title="Recent activity" flush />
      {events.length === 0 ? (
        <p className="text-text-muted text-body px-5 py-8 text-center">
          Decisions, comments and invoices will show here.
        </p>
      ) : (
        <ol className="divide-subtle divide-y">
          {events.slice(0, 5).map((e) => (
            <li key={e.id} className="text-body px-5 py-3">
              <p className="text-text-primary">
                {e.verb}
                {e.reference && (
                  <>
                    {" "}
                    on{" "}
                    {e.requestId ? (
                      <Link
                        href={`/requests/${e.requestId}`}
                        className="text-body-sm font-mono underline underline-offset-2"
                      >
                        {e.reference}
                      </Link>
                    ) : (
                      <span className="text-body-sm font-mono">{e.reference}</span>
                    )}
                  </>
                )}
              </p>
              <p className="text-text-muted text-body-sm">
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
