import Link from "next/link";
import { CalendarArrowDown, CalendarArrowUp, Inbox, KeyRound } from "lucide-react";
import type { Kpis } from "@/lib/domain/dashboard";
import { cn } from "@/lib/utils";

/** Four KPI tiles, each a link to the pre-filtered /requests view. Zero states show "0", never a dash. */
export function KpiRow({ kpis }: { kpis: Kpis }) {
  const tiles = [
    {
      icon: KeyRound,
      label: "Active placements",
      value: kpis.activePlacements,
      hint: "Guests currently in a property",
      href: "/requests?status=active",
      tone: "navy",
    },
    {
      icon: Inbox,
      label: "Pending with Live Luxe",
      value: kpis.pendingWithLivluxe,
      hint: "Awaiting a decision",
      href: "/requests?status=pending",
      tone: "gold",
    },
    {
      icon: CalendarArrowDown,
      label: "Check-ins next 7 days",
      value: kpis.checkInsNext7,
      hint: kpis.nextCheckInLabel ?? "None scheduled",
      href: "/requests?window=checkin-7d",
      tone: "navy",
    },
    {
      icon: CalendarArrowUp,
      label: "Check-outs next 7 days",
      value: kpis.checkOutsNext7,
      hint: kpis.nextCheckOutLabel ?? "None scheduled",
      href: "/requests?window=checkout-7d",
      tone: "navy",
    },
  ] as const;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => (
        <li key={t.label}>
          <Link
            href={t.href}
            className="border-cream-200 hover:border-navy-900/30 focus-visible:ring-ring block rounded-lg border bg-white p-5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="flex items-center justify-between">
              <p className="text-ink-700 text-sm font-medium">{t.label}</p>
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  t.tone === "gold" ? "bg-gold-500/10 text-gold-600" : "bg-navy-900/5 text-navy-900",
                )}
              >
                <t.icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className={cn("mt-3 font-serif text-4xl", t.tone === "gold" ? "text-gold-600" : "text-navy-900")}>
              {t.value}
            </p>
            <p className="text-ink-500 mt-1 text-xs">{t.hint}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
