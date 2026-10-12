import type { ReactNode } from "react";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./brand";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

const ROLE_LABELS: Record<string, string> = {
  partner_admin: "Administrator",
  partner_booker: "Booker",
  partner_viewer: "Viewer",
  partner_finance: "Finance",
  livluxe_ops: "Operations",
  livluxe_finance: "Finance",
  livluxe_admin: "Administrator",
};

/**
 * Shared chrome for the partner portal and the admin console (§13.5 Branding).
 * Partner tone: cream header like the public site. Admin tone: navy, so ops staff
 * always know which side of the system they are on — which is why the admin header
 * stays fixed navy in both themes rather than following the surface tokens. In dark
 * mode the partner header would otherwise land on the same colour and lose the tell.
 *
 * The header sticks: on a long requests table the nav and the theme control should
 * stay reachable, and a translucent blur behind it is the one place this UI borrows
 * iOS's material directly.
 */
export function AppShell({
  title,
  nav,
  user,
  children,
  tone = "partner",
}: {
  title: string;
  nav: NavItem[];
  user: { email?: string; role: string; orgName?: string | null; orgLogoUrl?: string | null };
  children: ReactNode;
  tone?: "partner" | "admin";
}) {
  const dark = tone === "admin";
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="focus:bg-accent focus:text-accent-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header
        className={cn(
          "sticky top-0 z-40 border-b backdrop-blur-xl",
          dark ? "bg-navy-900/85 border-navy-800 text-white" : "bg-muted/85 border-border",
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-8">
            <Wordmark
              href={dark ? "/admin/queue" : "/"}
              descriptor={dark ? "Operations" : "Partner portal"}
              tone={dark ? "dark" : "light"}
            />
            {/* Co-branded header (§13.5): the partner's own logo, small and muted, beside the wordmark. */}
            {!dark && user.orgLogoUrl && (
              <span className="border-cream-300 hidden items-center border-l pl-4 sm:flex">
                {/* eslint-disable-next-line @next/next/no-img-element -- partner-supplied asset, arbitrary host */}
                <img src={user.orgLogoUrl} alt={user.orgName ?? "Partner logo"} className="h-6 w-auto opacity-70" />
              </span>
            )}
            <NavLinks items={nav} tone={tone} />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div
              className={cn(
                "hidden text-right text-xs leading-tight 2xl:block",
                dark ? "text-white/80" : "text-foreground",
              )}
            >
              <div className="font-medium">{user.orgName ?? title}</div>
              <div className={cn("mt-0.5", dark ? "text-white/60" : "text-muted-foreground")}>
                {user.email} · {ROLE_LABELS[user.role] ?? user.role}
              </div>
            </div>
            <ThemeToggle tone={tone} />
            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className={cn(
                  "ease-ios h-9 rounded-md border px-3 text-xs font-medium whitespace-nowrap transition-colors duration-150 active:scale-[0.97]",
                  dark ? "border-white/20 text-white hover:bg-white/10" : "border-input text-strong hover:bg-card",
                )}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="px-4 md:hidden">
          <NavLinks items={nav} tone={tone} variant="mobile" />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-6">
        {children}
      </main>
      <footer className="border-border text-muted-foreground border-t px-4 py-5 text-center text-xs">
        Live Luxe Pty Ltd · ABN 16 678 772 613 · Partner bookings are confidential and subject to your agreement with
        Live Luxe.
      </footer>
    </div>
  );
}
