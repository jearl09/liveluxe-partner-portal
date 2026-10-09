import Link from "next/link";
import { StatusPill } from "@/components/ui/status-pill";
import { formatMoney } from "@/lib/domain/money";
import { humanizeDuration } from "@/lib/domain/dashboard";
import type { SlaBand } from "@/lib/domain/requests";
import type { RequestListItem } from "@/lib/requests/load";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const BAND: Record<SlaBand, string> = {
  on_track: "bg-emerald-100 text-emerald-800",
  at_risk: "bg-amber-100 text-amber-800",
  breached: "bg-red-100 text-red-800",
  paused: "bg-cream-200 text-ink-700",
  none: "bg-cream-100 text-ink-500",
};

function dueLabel(r: RequestListItem, now: Date): string {
  if (r.band === "paused") return "Waiting on partner";
  if (r.band === "none" || !r.decisionDueAt) return "—";
  const left = new Date(r.decisionDueAt).getTime() - now.getTime();
  return left < 0 ? `Overdue by ${humanizeDuration(Math.abs(left))}` : `Due in ${humanizeDuration(left)}`;
}

const shortDate = (iso: string) => formatDate(iso).replace(/^\w+ /, "");

/**
 * One table for both sides. `ops` adds the partner column and the SLA band;
 * the whole row is a link to the detail page for its side.
 */
export function RequestsTable({
  rows,
  hrefFor,
  ops = false,
  emptyTitle,
  emptyHint,
}: {
  rows: RequestListItem[];
  hrefFor: (r: RequestListItem) => string;
  ops?: boolean;
  emptyTitle: string;
  emptyHint: string;
}) {
  const now = new Date();
  if (rows.length === 0) {
    return (
      <div className="border-cream-200 rounded-xl border bg-white px-5 py-14 text-center">
        <p className="text-navy-900 font-medium">{emptyTitle}</p>
        <p className="text-ink-500 mx-auto mt-1 max-w-md text-sm">{emptyHint}</p>
      </div>
    );
  }
  return (
    <div className="border-cream-200 overflow-hidden rounded-xl border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="text-ink-500 text-xs tracking-wide uppercase">
          <tr className="border-cream-200 border-b">
            {ops && <th className="px-4 py-2.5 font-medium">SLA</th>}
            <th className="px-4 py-2.5 font-medium">Reference</th>
            {ops && <th className="px-3 py-2.5 font-medium">Partner</th>}
            <th className="px-3 py-2.5 font-medium">Property</th>
            <th className="px-3 py-2.5 font-medium">Dates</th>
            <th className="px-3 py-2.5 font-medium">Guest</th>
            <th className="px-3 py-2.5 text-right font-medium">Total</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-cream-200 hover:bg-cream-50 relative border-b last:border-0">
              {ops && (
                <td className="px-4 py-3 align-top">
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs whitespace-nowrap", BAND[r.band])}>
                    {dueLabel(r, now)}
                  </span>
                </td>
              )}
              <td className="px-4 py-3 align-top font-mono text-xs">
                <Link
                  href={hrefFor(r)}
                  className="text-navy-900 after:absolute after:inset-0 focus-visible:outline-none"
                >
                  {r.reference}
                </Link>
                {(r.claimRef || r.poNumber) && <span className="text-ink-500 block">{r.claimRef ?? r.poNumber}</span>}
              </td>
              {ops && <td className="text-navy-900 px-3 py-3 align-top">{r.orgName ?? "—"}</td>}
              <td className="px-3 py-3 align-top">
                <span className="text-navy-900">{r.propertyName}</span>
                {r.suburb && <span className="text-ink-500 block text-xs">{r.suburb}</span>}
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap">
                {shortDate(r.checkIn)} → {shortDate(r.checkOut)}
                <span className="text-ink-500 block text-xs">{r.nights} nights</span>
              </td>
              <td className="text-navy-900 px-3 py-3 align-top">{r.guestName ?? "—"}</td>
              <td className="px-3 py-3 text-right align-top font-mono text-xs whitespace-nowrap">
                {r.totalCents != null ? formatMoney(r.totalCents, r.currency) : "—"}
              </td>
              <td className="px-3 py-3 align-top">
                <StatusPill status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
