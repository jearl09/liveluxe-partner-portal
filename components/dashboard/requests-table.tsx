import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import type { RequestTableRow } from "@/lib/domain/dashboard";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const DUE_TONE = {
  navy: "text-navy-900",
  gold: "text-gold-600 font-medium",
  muted: "text-ink-500",
  red: "text-red-700 font-medium",
} as const;

function RefMono({ r }: { r: RequestTableRow }) {
  const secondary = r.claimRef ?? r.poNumber;
  return (
    <span className="font-mono text-xs whitespace-nowrap">
      <span className="text-navy-900">{r.reference}</span>
      {secondary && <span className="text-ink-500 block">{secondary}</span>}
    </span>
  );
}

function Dates({ r }: { r: RequestTableRow }) {
  return (
    <span className="text-sm">
      <span className="whitespace-nowrap">{formatDate(r.checkIn).replace(/^\w+ /, "")}</span> →{" "}
      <span className="whitespace-nowrap">{formatDate(r.checkOut).replace(/^\w+ /, "")}</span>
      <span className="text-ink-500 block text-xs">{r.nights} nights</span>
    </span>
  );
}

/** Requests in progress: table on desktop, card list on tablet/phone. The whole row is one link. */
export function RequestsTable({ rows, firstTime }: { rows: RequestTableRow[]; firstTime: boolean }) {
  return (
    <section aria-labelledby="requests-heading" className="border-cream-200 print-section rounded-lg border bg-white">
      <header className="border-cream-200 flex items-center justify-between border-b px-5 py-4">
        <h2 id="requests-heading" className="font-serif text-xl">
          Requests in progress
        </h2>
        <Link href="/requests" className="text-navy-900 flex items-center gap-1 text-sm hover:underline print:hidden">
          All requests <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <svg
            aria-hidden
            viewBox="0 0 120 72"
            className="text-cream-300 mx-auto h-16 w-auto"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="10" y="14" width="100" height="48" rx="6" />
            <path d="M10 28h100M30 42h40M30 52h24" />
            <circle cx="92" cy="47" r="7" className="text-gold-500" />
          </svg>
          <p className="text-navy-900 mt-4 font-medium">{firstTime ? "No requests yet" : "Nothing in progress"}</p>
          <p className="text-ink-500 mx-auto mt-1 max-w-sm text-sm">
            Search availability for your guest&apos;s dates, build a quote and submit it. Its status will track here.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/search">
              <Search className="h-3.5 w-3.5" aria-hidden /> Start a search
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <table className="hidden w-full text-left lg:table">
            <caption className="sr-only">Requests in progress, partner action first then by due time</caption>
            <thead className="text-ink-500 text-xs tracking-wide uppercase">
              <tr className="border-cream-200 border-b">
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Reference
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Property
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Dates
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Due / next step
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-cream-200 relative border-b last:border-0">
                  <td className="px-5 py-3 align-top">
                    <Link
                      href={`/requests/${r.id}`}
                      className="focus-visible:ring-ring after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset"
                      aria-label={`Open request ${r.reference}`}
                    >
                      <RefMono r={r} />
                    </Link>
                  </td>
                  <td className="px-3 py-3 align-top text-sm">
                    <span className="text-navy-900">{r.propertyName}</span>
                    {r.suburb && <span className="text-ink-500 block text-xs">{r.suburb}</span>}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Dates r={r} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <StatusPill status={r.status} />
                  </td>
                  <td className={cn("px-5 py-3 align-top text-sm", DUE_TONE[r.dueTone])}>{r.dueLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Tablet / phone cards */}
          <ul className="divide-cream-200 divide-y lg:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="focus-visible:ring-ring block px-5 py-4 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                >
                  <div className="flex items-start justify-between gap-3">
                    <RefMono r={r} />
                    <StatusPill status={r.status} />
                  </div>
                  <p className="text-navy-900 mt-2 text-sm">
                    {r.propertyName}
                    {r.suburb && <span className="text-ink-500">, {r.suburb}</span>}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <Dates r={r} />
                    <span className={cn("text-right text-xs", DUE_TONE[r.dueTone])}>{r.dueLabel}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
