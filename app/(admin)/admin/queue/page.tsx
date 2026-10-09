import { PageHeader } from "@/components/ui/page-header";
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
    breached: rows.filter((r) => r.band === "breached").length,
    atRisk: rows.filter((r) => r.band === "at_risk").length,
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Request queue"
        description={
          rows.length === 0
            ? "Nothing waiting on Live Luxe."
            : `${rows.length} waiting · ${counts.breached} overdue · ${counts.atRisk} at risk`
        }
        actions={
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">On track</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">At risk</span>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">Breached</span>
          </div>
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
