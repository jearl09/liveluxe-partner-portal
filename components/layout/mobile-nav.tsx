"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { FileText, LayoutDashboard, LogOut, Menu, MoreHorizontal, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, type NavItem } from "./nav-links";

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/search": Search,
  "/requests": FileText,
};

/** Sheet listing every destination plus Sign out, used by both phone navs. */
function NavSheet({
  items,
  open,
  onOpenChange,
  title,
  side,
}: {
  items: NavItem[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  side: "bottom" | "left";
}) {
  const pathname = usePathname();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="anim-fade bg-navy/50 fixed inset-0 z-50" />
        <D.Content
          className={cn(
            "bg-surface border-subtle fixed z-50 flex flex-col shadow-lg focus:outline-none",
            side === "bottom"
              ? "anim-dialog rounded-t-card inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)]"
              : "anim-sheet inset-y-0 left-0 w-[min(20rem,85vw)] border-r",
          )}
        >
          <div className="border-subtle flex items-center justify-between border-b px-4 py-3">
            <D.Title className="text-h2 font-serif">{title}</D.Title>
            <D.Description className="sr-only">Go to another part of the portal or sign out.</D.Description>
            <D.Close
              aria-label="Close menu"
              className="text-text-primary hover:bg-inset rounded-control flex h-11 w-11 items-center justify-center"
            >
              <X className="h-5 w-5" aria-hidden />
            </D.Close>
          </div>
          <nav aria-label="All pages" className="flex flex-col p-2">
            {items.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => onOpenChange(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-control text-body flex h-12 items-center justify-between px-3",
                    active ? "bg-inset text-text-gold font-semibold" : "text-text-primary hover:bg-inset",
                  )}
                >
                  {n.label}
                  {n.count != null && n.count > 0 && (
                    <span
                      className={cn(
                        "rounded-pill text-body-sm px-2 font-semibold tabular-nums",
                        n.alert ? "bg-danger-fg text-surface" : "bg-inset text-text-primary",
                      )}
                    >
                      {n.count}
                    </span>
                  )}
                </Link>
              );
            })}
            <form action="/api/auth/sign-out" method="post" className="border-subtle mt-2 border-t pt-2">
              <button
                type="submit"
                className="text-text-primary hover:bg-inset rounded-control flex h-12 w-full items-center gap-2 px-3 text-left"
              >
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </form>
          </nav>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/**
 * Partner phone navigation (brief §10.1): a bottom tab bar within thumb reach —
 * Dashboard, Search, Requests, More — instead of a second header row. Below 768 px.
 */
export function PartnerTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = items.filter((n) => n.href in ICONS);
  const moreActive = items.some((n) => !(n.href in ICONS) && isActive(pathname, n.href));
  return (
    <>
      <nav
        data-app-chrome
        aria-label="Primary"
        className="bg-surface border-subtle fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primary.map((n) => {
          const Icon = ICONS[n.href]!;
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-body-sm flex h-16 flex-col items-center justify-center gap-1",
                active ? "text-text-gold font-semibold" : "text-text-secondary",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {n.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={cn(
            "text-body-sm flex h-16 flex-col items-center justify-center gap-1",
            moreActive ? "text-text-gold font-semibold" : "text-text-secondary",
          )}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>
      <NavSheet items={items} open={open} onOpenChange={setOpen} title="Menu" side="bottom" />
    </>
  );
}

/** Ops phone navigation (brief §10.1): the nav in a drawer from the left. Below 768 px. */
export function OpsDrawer({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const alert = items.some((n) => n.alert);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={alert ? "Open menu (requests overdue)" : "Open menu"}
        className="text-on-navy rounded-control relative flex h-11 w-11 items-center justify-center hover:bg-on-navy-hover md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
        {alert && <span aria-hidden className="bg-danger-fg rounded-pill absolute top-2 right-2 h-2 w-2" />}
      </button>
      <NavSheet items={items} open={open} onOpenChange={setOpen} title="Operations" side="left" />
    </>
  );
}
