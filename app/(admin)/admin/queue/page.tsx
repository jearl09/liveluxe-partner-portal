import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Request queue" };

/**
 * Primary ops screen (§13.4). Sorted by decision_due_at ascending (urgency, not age),
 * colour bands on-track / at-risk / breached, inline approve / decline / counter,
 * keyboard shortcuts (j/k/a/d), Supabase Realtime for live updates and soft row-locking.
 * TODO(phase-5): GET /api/admin/queue + Realtime subscription.
 */
export default function QueuePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Request queue"
        description="Sorted by decision deadline. Clear it without leaving the page."
        actions={
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">On track</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">At risk</span>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">Breached</span>
          </div>
        }
      />
      <div className="border-cream-200 rounded-xl border bg-white px-5 py-14 text-center">
        <p className="text-navy-900 font-medium">The queue is empty</p>
        <p className="text-ink-500 mt-1 text-sm">
          Partner requests appear here the moment they are submitted, ordered by SLA deadline.
        </p>
      </div>
    </div>
  );
}
