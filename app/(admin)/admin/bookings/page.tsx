import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { RequestsTable } from "@/components/requests/requests-table";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/domain/booking-state-machine";
import { STATUS_LABELS } from "@/lib/domain/dashboard";
import { listAllRequests } from "@/lib/requests/load";
import { cn } from "@/lib/utils";

export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

/** Every request across every partner, filterable by status (§13.4 "Bookings"). */
export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status: BookingStatus | "all" = (BOOKING_STATUSES as readonly string[]).includes(raw ?? "")
    ? (raw as BookingStatus)
    : "all";
  const rows = await listAllRequests({ status });
  const filters: (BookingStatus | "all")[] = [
    "all",
    "SUBMITTED",
    "UNDER_REVIEW",
    "COUNTER_OFFERED",
    "APPROVED",
    "CONFIRMED",
    "DECLINED",
    "EXPIRED",
    "CANCELLED",
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operations" title="Bookings" description="All partner requests, newest activity first." />
      <nav aria-label="Status filter" className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/admin/bookings" : `/admin/bookings?status=${f}`}
            aria-current={status === f ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              status === f
                ? "border-navy-900 bg-navy-900 text-white"
                : "border-cream-300 text-ink-700 hover:bg-cream-50 bg-white",
            )}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
          </Link>
        ))}
      </nav>
      <RequestsTable
        rows={rows}
        ops
        hrefFor={(r) => `/admin/bookings/${r.id}`}
        emptyTitle="No bookings match"
        emptyHint="Try another status filter."
      />
    </div>
  );
}
