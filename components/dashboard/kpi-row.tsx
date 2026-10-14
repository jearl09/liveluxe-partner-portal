import Link from "next/link";
import { CalendarArrowDown, CalendarArrowUp, Hourglass, KeyRound } from "lucide-react";
import type { Kpis } from "@/lib/domain/dashboard";

/**
 * KPI row (brief §7.2): four tiles, each a link to the Requests list. Zero shows "0",
 * never a dash. Links go to the tab that holds those requests until the Requests
 * list gains its own filters (screen group 5).
 */
export function KpiRow({ kpis }: { kpis: Kpis }) {
  const tiles = [
    {
      icon: KeyRound,
      label: "Active placements",
      value: kpis.activePlacements,
      hint: kpis.activePlacements === 1 ? "Household in a property now" : "Households in a property now",
      href: "/requests?tab=upcoming",
    },
    {
      icon: Hourglass,
      label: "In progress",
      value: kpis.inProgress,
      hint:
        kpis.pendingWithLivluxe > 0
          ? `${kpis.pendingWithLivluxe} waiting on Live Luxe`
          : kpis.inProgress > 0
            ? "None waiting on Live Luxe"
            : "No live requests",
      href: "/requests",
    },
    {
      icon: CalendarArrowDown,
      label: "Check-ins next 7 days",
      value: kpis.checkInsNext7,
      hint: kpis.nextCheckInLabel ?? "None scheduled",
      href: "/requests?tab=upcoming",
    },
    {
      icon: CalendarArrowUp,
      label: "Check-outs next 7 days",
      value: kpis.checkOutsNext7,
      hint: kpis.checkOutsNext7 > 0 ? `${kpis.checkOutsNext7} ending — consider extensions` : "None scheduled",
      href: "/requests?tab=upcoming",
    },
  ] as const;
  return (
    <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Summary">
      {tiles.map((t) => (
        <li key={t.label}>
          <Link
            href={t.href}
            className="border-subtle bg-surface rounded-card hover:border-strong-border focus-visible:outline-focus block h-full border p-4 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 sm:p-5"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-text-secondary text-body-sm font-semibold">{t.label}</span>
              <t.icon className="text-text-muted h-4 w-4 shrink-0" aria-hidden />
            </span>
            <span className="text-text-primary text-display mt-2 block font-serif tabular-nums">{t.value}</span>
            <span className="text-text-muted text-body-sm mt-1 block">{t.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
