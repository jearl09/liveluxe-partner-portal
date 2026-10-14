"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  /** Small count after the label (ops Queue). */
  count?: number;
  /** Count shown in the danger tone (something is overdue). */
  alert?: boolean;
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/**
 * Primary navigation (brief §6.1): active item in gold text with a 2 px gold underline,
 * hover in primary text, focus ring on keyboard focus only. No pill outlines. On the
 * navy ops header the brighter gold is the readable one (The Navy Side Rule).
 */
export function NavLinks({ items, tone }: { items: NavItem[]; tone: "partner" | "ops" }) {
  const pathname = usePathname();
  const navy = tone === "ops";
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {items.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-control text-body relative flex h-10 items-center gap-1.5 px-3 whitespace-nowrap transition-colors duration-150",
              navy ? "text-on-navy-muted hover:text-on-navy" : "text-text-secondary hover:text-text-primary",
              active &&
                (navy
                  ? "text-gold-400 hover:text-gold-400 font-semibold"
                  : "text-text-gold hover:text-text-gold font-semibold"),
              active && "after:bg-gold after:absolute after:right-3 after:-bottom-[13px] after:left-3 after:h-0.5",
            )}
          >
            {n.label}
            {n.count != null && n.count > 0 && (
              <span
                className={cn(
                  "rounded-pill text-body-sm min-w-5 px-1.5 text-center font-semibold tabular-nums",
                  n.alert
                    ? "bg-danger-fg text-surface"
                    : navy
                      ? "text-on-navy bg-white/15"
                      : "bg-inset text-text-primary",
                )}
              >
                {n.count}
                <span className="sr-only">{n.alert ? " waiting, some overdue" : " waiting"}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
