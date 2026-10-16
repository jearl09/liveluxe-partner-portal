import Link from "next/link";
import { CalendarArrowDown, CalendarArrowUp, Hourglass, KeyRound } from "lucide-react";
import type { Kpis } from "@/lib/domain/dashboard";
import { cn } from "@/lib/utils";

/**
 * KPI row (brief §7.2): one strip of four figures, each a link to the Requests chip that holds those requests.
 * Zero shows "0", never a dash, but quietly in muted ink, so a figure that matters stands out from the ones that
 * are empty instead of four equal boxes shouting "0".
 */
export function KpiRow({ kpis }: { kpis: Kpis }) {
  const tiles = [
    {
      icon: KeyRound,
      label: "Active placements",
      value: kpis.activePlacements,
      hint: kpis.activePlacements === 1 ? "Household in a property now" : "Households in a property now",
      href: "/requests?group=confirmed",
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
      href: "/requests?group=progress",
    },
    {
      icon: CalendarArrowDown,
      label: "Check-ins next 7 days",
      value: kpis.checkInsNext7,
      hint: kpis.nextCheckInLabel ?? "None scheduled",
      href: "/requests?group=confirmed",
    },
    {
      icon: CalendarArrowUp,
      label: "Check-outs next 7 days",
      value: kpis.checkOutsNext7,
      hint: kpis.checkOutsNext7 > 0 ? `${kpis.checkOutsNext7} ending — consider extensions` : "None scheduled",
      href: "/requests?group=confirmed",
    },
  ] as const;
  return (
    <ul
      className="border-subtle bg-subtle rounded-card grid grid-cols-2 gap-px overflow-hidden border xl:grid-cols-4"
      aria-label="Summary"
    >
      {tiles.map((t) => (
        <li key={t.label} className="bg-surface">
          <Link
            href={t.href}
            className="hover:bg-inset focus-visible:outline-focus group flex h-full flex-col px-4 py-4 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 sm:px-5"
          >
            <span className="text-text-secondary text-body-sm flex items-center gap-2 font-semibold">
              <t.icon className="text-text-muted h-4 w-4 shrink-0" aria-hidden />
              {t.label}
            </span>
            <span
              className={cn(
                "text-h1 mt-2 block font-serif leading-none tabular-nums",
                t.value > 0 ? "text-text-primary" : "text-text-muted",
              )}
            >
              {t.value}
            </span>
            <span className="text-text-muted text-body-sm mt-2 block">{t.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
