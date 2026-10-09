import type { ReactNode } from "react";
import { NavLinks } from "./nav-links";
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
 * always know which side of the system they are on.
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
        className="focus:bg-accent sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <header
        className={cn("border-b", dark ? "bg-navy-900 border-navy-800 text-white" : "bg-cream-100 border-cream-200")}
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
          <div className="flex shrink-0 items-center gap-4">
            <div
              className={cn(
                "hidden text-right text-xs leading-tight lg:block",
                dark ? "text-white/80" : "text-ink-700",
              )}
            >
              <div className="font-medium">{user.orgName ?? title}</div>
              <div className={cn("mt-0.5", dark ? "text-white/60" : "text-ink-500")}>
                {user.email} · {ROLE_LABELS[user.role] ?? user.role}
              </div>
            </div>
            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className={cn(
                  "h-9 rounded-md border px-3 text-xs font-medium whitespace-nowrap transition-colors",
                  dark
                    ? "border-white/20 text-white hover:bg-white/10"
                    : "border-cream-300 text-navy-900 hover:bg-white",
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
      <footer className="border-cream-200 text-ink-500 border-t px-4 py-5 text-center text-xs">
        Live Luxe Pty Ltd · ABN 16 678 772 613 · Partner bookings are confidential and subject to your agreement with
        Live Luxe.
      </footer>
    </div>
  );
}
