"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  partner_admin: "Administrator",
  partner_booker: "Booker",
  partner_viewer: "Viewer",
  partner_finance: "Finance",
  livluxe_ops: "Operations",
  livluxe_finance: "Finance",
  livluxe_admin: "Administrator",
};

function initials(name: string | null, email: string | null) {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Account menu (brief §6.1, §7.1): initials, then name, email, organisation and role,
 * Settings and Sign out. Replaces the cramped email · role text block in the header.
 */
export function AccountMenu({
  name,
  email,
  role,
  orgName,
  settingsHref,
  tone,
}: {
  name: string | null;
  email: string | null;
  role: string;
  orgName: string | null;
  settingsHref: string;
  tone: "partner" | "ops";
}) {
  const navy = tone === "ops";
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "rounded-control flex h-10 items-center gap-2 px-1.5 transition-colors duration-150",
          "coarse:min-h-11",
          navy ? "text-on-navy hover:bg-white/10" : "text-text-primary hover:bg-surface",
        )}
        aria-label={`Account: ${name ?? email ?? "signed in"}`}
      >
        <span
          aria-hidden
          className={cn(
            "rounded-pill text-body-sm flex h-8 w-8 items-center justify-center font-semibold",
            navy ? "text-on-navy bg-white/15" : "bg-text-primary text-surface",
          )}
        >
          {initials(name, email)}
        </span>
        <span className="text-body-sm hidden max-w-40 truncate font-semibold xl:block">{name ?? email}</span>
        <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="bg-surface-raised border-subtle text-text-secondary rounded-card z-50 w-72 border p-2 shadow-md"
        >
          <div className="px-2 pt-1 pb-2">
            <p className="text-text-primary truncate font-semibold">{name ?? "Signed in"}</p>
            {email && <p className="text-body-sm truncate">{email}</p>}
            <p className="text-text-muted text-body-sm mt-1">
              {[orgName, ROLE_LABELS[role] ?? role].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Menu.Separator className="bg-subtle my-1 h-px" />
          <Menu.Item asChild>
            <Link
              href={settingsHref}
              className="text-text-primary rounded-control data-[highlighted]:bg-inset flex h-10 items-center gap-2 px-2 outline-none"
            >
              <Settings className="h-4 w-4" aria-hidden /> Settings and security
            </Link>
          </Menu.Item>
          <form action="/api/auth/sign-out" method="post">
            <Menu.Item asChild onSelect={(e) => e.preventDefault()}>
              <button
                type="submit"
                className="text-text-primary rounded-control data-[highlighted]:bg-inset flex h-10 w-full items-center gap-2 px-2 text-left outline-none"
              >
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </Menu.Item>
          </form>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
