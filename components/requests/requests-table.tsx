import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StatusPill } from "@/components/ui/status-pill";
import { tdClass, thClass, theadClass } from "@/components/ui/table";
import { formatMoney } from "@/lib/domain/money";
import { humanizeDuration } from "@/lib/domain/dashboard";
import type { SlaBand } from "@/lib/domain/requests";
import type { RequestListItem } from "@/lib/requests/load";
import { formatDate } from "@/lib/utils";

const BAND: Record<SlaBand, PillTone> = {
  on_track: "ok",
  at_risk: "warn",
  breached: "bad",
  paused: "muted",
  none: "neutral",
};

function dueLabel(r: RequestListItem, now: Date): string {
  if (r.band === "paused") return "Waiting on partner";
  if (r.band === "none" || !r.decisionDueAt) return "—";
  const left = new Date(r.decisionDueAt).getTime() - now.getTime();
  return left < 0 ? `Overdue by ${humanizeDuration(Math.abs(left))}` : `Due in ${humanizeDuration(left)}`;
}

const shortDate = (iso: string) => formatDate(iso).replace(/^\w+ /, "");

function Reference({ r }: { r: RequestListItem }) {
  return (
    <span className="font-mono text-xs whitespace-nowrap">
      <span className="text-strong">{r.reference}</span>
      {(r.claimRef || r.poNumber) && <span className="text-muted-foreground block">{r.claimRef ?? r.poNumber}</span>}
    </span>
  );
}

/**
 * One list for both sides. `ops` adds the partner column and the SLA band; the whole
 * row is a link to the detail page for its side. Wide screens get the table; below
 * `lg` each request becomes a stacked entry, because eight columns do not survive a
 * phone and a sideways-scrolling table hides the status.
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
      <Panel className="px-5 py-14 text-center">
        <p className="text-strong font-medium">{emptyTitle}</p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">{emptyHint}</p>
      </Panel>
    );
  }

  const rowLink =
    "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset";

  return (
    <Panel flush>
      <table className="hidden w-full text-left text-sm lg:table">
        <thead className={theadClass}>
          <tr className="border-border border-b">
            {ops && <th className={thClass}>SLA</th>}
            <th className={thClass}>Reference</th>
            {ops && <th className={thClass}>Partner</th>}
            <th className={thClass}>Property</th>
            <th className={thClass}>Dates</th>
            <th className={thClass}>Guest</th>
            <th className={`${thClass} text-right`}>Total</th>
            <th className={thClass}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-border hover:bg-muted/50 relative border-b transition-colors last:border-0"
            >
              {ops && (
                <td className={tdClass}>
                  <Pill tone={BAND[r.band]}>{dueLabel(r, now)}</Pill>
                </td>
              )}
              <td className={tdClass}>
                <Link href={hrefFor(r)} className={rowLink} aria-label={`Open request ${r.reference}`}>
                  <Reference r={r} />
                </Link>
              </td>
              {ops && <td className={`${tdClass} text-strong`}>{r.orgName ?? "—"}</td>}
              <td className={tdClass}>
                <span className="text-strong">{r.propertyName}</span>
                {r.suburb && <span className="text-muted-foreground block text-xs">{r.suburb}</span>}
              </td>
              <td className={`${tdClass} whitespace-nowrap`}>
                {shortDate(r.checkIn)} → {shortDate(r.checkOut)}
                <span className="text-muted-foreground block text-xs">{r.nights} nights</span>
              </td>
              <td className={`${tdClass} text-strong`}>{r.guestName ?? "—"}</td>
              <td className={`${tdClass} text-right whitespace-nowrap tabular-nums`}>
                {r.totalCents != null ? formatMoney(r.totalCents, r.currency) : "—"}
              </td>
              <td className={tdClass}>
                <StatusPill status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-border divide-y lg:hidden">
        {rows.map((r) => (
          <li key={r.id} className="hover:bg-muted/50 relative px-5 py-4 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <Link href={hrefFor(r)} className={rowLink} aria-label={`Open request ${r.reference}`}>
                <Reference r={r} />
              </Link>
              <StatusPill status={r.status} />
            </div>
            <p className="text-strong mt-2 text-sm">
              {r.propertyName}
              {r.suburb && <span className="text-muted-foreground">, {r.suburb}</span>}
            </p>
            <p className="text-foreground mt-0.5 text-sm">
              {shortDate(r.checkIn)} → {shortDate(r.checkOut)}
              <span className="text-muted-foreground"> · {r.nights} nights</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span className="text-foreground">
                {ops ? (r.orgName ?? "—") : (r.guestName ?? "—")}
                {ops && r.guestName && <span className="text-muted-foreground"> · {r.guestName}</span>}
              </span>
              <span className="text-strong tabular-nums">
                {r.totalCents != null ? formatMoney(r.totalCents, r.currency) : "—"}
              </span>
            </div>
            {ops && (
              <div className="mt-2">
                <Pill tone={BAND[r.band]}>{dueLabel(r, now)}</Pill>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
