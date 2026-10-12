import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { Flash } from "@/components/requests/flash";
import { RequestsTable } from "@/components/requests/requests-table";
import { listQueue } from "@/lib/requests/load";

export const metadata = { title: "Request queue" };
export const dynamic = "force-dynamic";

/**
 * Primary ops screen (§13.4). Sorted by decision_due_at ascending (urgency, not age)
 * with on-track / at-risk / breached bands. Realtime refresh and keyboard shortcuts
 * come later; the page is cheap to reload.
 */
export default async function QueuePage({ searchParams }: PageProps<"/admin/queue">) {
  const sp = await searchParams;
  const rows = await listQueue();
  const counts = {
    onTrack: rows.filter((r) => r.band === "on_track").length,
    atRisk: rows.filter((r) => r.band === "at_risk").length,
    breached: rows.filter((r) => r.band === "breached").length,
    paused: rows.filter((r) => r.band === "paused").length,
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Request queue"
        description={
          rows.length === 0
            ? "Nothing waiting on Live Luxe."
            : `${rows.length} ${rows.length === 1 ? "request" : "requests"}, ordered by decision deadline.`
        }
        actions={
          rows.length > 0 && (
            // The legend doubles as the tally, so the numbers live in one place.
            <ul className="flex flex-wrap gap-2" aria-label="By SLA band">
              <li>
                <Pill tone="bad">{counts.breached} overdue</Pill>
              </li>
              <li>
                <Pill tone="warn">{counts.atRisk} at risk</Pill>
              </li>
              <li>
                <Pill tone="ok">{counts.onTrack} on track</Pill>
              </li>
              {counts.paused > 0 && (
                <li>
                  <Pill tone="muted">{counts.paused} waiting on partner</Pill>
                </li>
              )}
            </ul>
          )
        }
      />
      <Flash error={Array.isArray(sp.error) ? sp.error[0] : sp.error} />
      <RequestsTable
        rows={rows}
        ops
        hrefFor={(r) => `/admin/bookings/${r.id}`}
        emptyTitle="The queue is empty"
        emptyHint="Partner requests appear here the moment they are submitted, ordered by decision deadline."
      />
    </div>
  );
}
