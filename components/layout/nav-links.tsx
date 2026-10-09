"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./app-shell";

/**
 * Primary navigation with the active item underlined in brand gold. One component
 * serves the desktop row and the phone strip so both agree on what is "current".
 */
export function NavLinks({
  items,
  tone,
  variant = "desktop",
}: {
  items: NavItem[];
  tone: "partner" | "admin";
  variant?: "desktop" | "mobile";
}) {
  const pathname = usePathname();
  const dark = tone === "admin";
  const mobile = variant === "mobile";
  return (
    <nav
      aria-label={mobile ? "Primary (mobile)" : "Primary"}
      className={cn(
        "items-center",
        mobile ? "-mx-1 flex gap-0.5 overflow-x-auto px-1 pb-2 md:hidden" : "hidden gap-0.5 md:flex",
      )}
    >
      {items.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              dark
                ? "text-white/75 hover:bg-white/10 hover:text-white"
                : "text-ink-700 hover:text-navy-900 hover:bg-white",
              active && (dark ? "text-white" : "text-navy-900 font-medium"),
              active && "after:bg-gold-500 after:absolute after:right-3 after:-bottom-px after:left-3 after:h-0.5",
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
