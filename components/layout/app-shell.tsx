import type { ReactNode } from "react";
import { SyncState } from "@/components/ui/states";
import type { SyncModel } from "@/lib/domain/progress";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";
import { Wordmark } from "./brand";
import { ContactPopover } from "./contact-popover";
import { OpsDrawer, PartnerTabBar } from "./mobile-nav";
import { NavLinks, type NavItem } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export type { NavItem };

/**
 * The two shells (brief §6.1, §7.1). One component, two environments:
 *
 *   ops      fixed Harbour Navy header in both themes (The Navy Side Rule, DECISIONS #1),
 *            "Live Luxe · Operations", Queue with a live count, a drawer on phones.
 *   partner  cream header, "Live Luxe · Partner portal", the partner's logo when one exists,
 *            a bottom tab bar on phones.
 *
 * Both: one SyncState dot in the header, the theme control, and an account menu with
 * name, organisation and role. The header sticks; nothing important hides behind hover.
 */
export function AppShell({
  tone,
  nav,
  user,
  sync,
  supportEmail,
  children,
}: {
  tone: "partner" | "ops";
  nav: NavItem[];
  user: { name: string | null; email: string | null; role: string; orgName: string | null; orgLogoUrl?: string | null };
  sync: SyncModel;
  supportEmail: string;
  children: ReactNode;
}) {
  const navy = tone === "ops";
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="bg-gold text-on-gold rounded-control sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header
        data-app-chrome
        className={cn("sticky top-0 z-40 border-b", navy ? "bg-navy border-navy-hover" : "bg-inset border-subtle")}
      >
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4 md:gap-6 md:px-6">
          {navy && <OpsDrawer items={nav} />}
          <Wordmark
            href={navy ? "/admin/queue" : "/"}
            descriptor={navy ? "Operations" : "Partner portal"}
            tone={navy ? "dark" : "light"}
          />
          {!navy && user.orgLogoUrl && (
            <span className="border-subtle hidden items-center border-l pl-4 lg:flex">
              {/* eslint-disable-next-line @next/next/no-img-element -- partner-supplied asset, arbitrary host */}
              <img src={user.orgLogoUrl} alt={user.orgName ?? "Partner logo"} className="h-6 w-auto" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <NavLinks items={nav} tone={tone} />
          </div>
          <div className="flex shrink-0 items-center gap-1 md:gap-2">
            <span className={cn("hidden items-center 2xl:flex", navy && "[&_p]:text-on-navy-muted")}>
              <SyncState model={sync} audience={navy ? "ops" : "partner"} compact />
            </span>
            <span className="2xl:hidden" title="Availability">
              <SyncDot model={sync} navy={navy} />
            </span>
            <ThemeToggle tone={navy ? "admin" : "partner"} />
            <AccountMenu
              name={user.name}
              email={user.email}
              role={user.role}
              orgName={user.orgName}
              settingsHref={navy ? "/admin/settings" : "/settings"}
              tone={tone}
            />
          </div>
        </div>
      </header>

      <main
        id="main"
        className={cn(
          "mx-auto w-full flex-1 px-4 py-8 md:px-6",
          navy ? "max-w-[90rem]" : "max-w-[80rem]",
          !navy && "pb-24 md:pb-8",
        )}
      >
        {children}
      </main>

      <footer
        data-app-chrome
        className={cn(
          "border-subtle text-text-muted text-body-sm border-t px-4 py-5 text-center",
          !navy && "mb-16 md:mb-0",
        )}
      >
        <p>
          Live Luxe Pty Ltd · ABN 16 678 772 613 · Partner bookings are confidential and subject to your agreement with
          Live Luxe.
        </p>
        {!navy && (
          <p className="mt-1">
            <ContactPopover email={supportEmail} />
          </p>
        )}
      </footer>

      {!navy && <PartnerTabBar items={nav} />}
    </div>
  );
}

/** The header's compact freshness signal below 1536 px: a dot with its meaning in words for everyone. */
function SyncDot({ model, navy }: { model: SyncModel; navy: boolean }) {
  const label =
    model.level === "live"
      ? "Availability is up to date"
      : model.level === "delayed"
        ? "Availability may be out of date"
        : model.level === "degraded"
          ? "Live availability unavailable"
          : "Availability not confirmed yet";
  const dot = navy
    ? {
        live: "bg-on-navy-success",
        delayed: "bg-on-navy-attention",
        degraded: "bg-on-navy-danger",
        unknown: "bg-on-navy-muted",
      }[model.level]
    : { live: "bg-success-fg", delayed: "bg-attention-fg", degraded: "bg-danger-fg", unknown: "bg-text-muted" }[
        model.level
      ];
  return (
    <span role="img" aria-label={label} title={label} className="flex h-10 w-6 items-center justify-center">
      <span aria-hidden className={cn("rounded-pill h-2.5 w-2.5", dot)} />
    </span>
  );
}
