import Link from "next/link";
import type { ActivityEvent } from "@/lib/dashboard/types";

/** Recent activity: last six events. Every timestamp carries its timezone; UTC on hover. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section aria-labelledby="activity-heading" className="border-cream-200 rounded-lg border bg-white">
      <header className="border-cream-200 border-b px-5 py-4">
        <h2 id="activity-heading" className="font-serif text-xl">
          Recent activity
        </h2>
      </header>
      {events.length === 0 ? (
        <p className="text-ink-500 px-5 py-8 text-center text-sm">Decisions, comments and invoices will show here.</p>
      ) : (
        <ol className="divide-cream-200 divide-y">
          {events.map((e) => (
            <li key={e.id} className="px-5 py-3 text-sm">
              <p className="text-navy-900">
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
              <p className="text-ink-500 text-xs">
                <time dateTime={e.atIso} title={`${e.atUtc} (UTC)`}>
                  {e.atLabel}
                </time>
                {e.actor && <> by {e.actor}</>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
