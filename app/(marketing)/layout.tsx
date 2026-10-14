import type { ReactNode } from "react";
import { Wordmark } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AUTH_FLASH_KEYS, ScrubParams } from "@/components/ui/scrub-params";

/**
 * Public auth surfaces: login, invite acceptance, password reset, MFA (§13.1).
 * Branded, minimal, no inventory. Split layout echoing the public site's hero:
 * navy brand panel on the left, the form on the canvas to the right. Stacks on mobile.
 * The navy panel keeps its fixed brand colours in both themes — it is the hero of the
 * public site, not a surface — while the form side follows the theme like everything else.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[5fr_6fr]">
      <aside className="bg-navy-900 relative flex flex-col justify-between overflow-hidden border-on-navy-line px-6 py-6 text-on-navy sm:px-8 sm:py-8 lg:border-r lg:px-14 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(transparent 31px, var(--on-navy-grid) 32px), linear-gradient(90deg, transparent 31px, var(--on-navy-grid) 32px)",
            backgroundSize: "32px 32px",
          }}
        />
        <Wordmark descriptor="Partner portal" tone="dark" className="relative" />
        <div className="relative mt-8 max-w-md lg:my-0">
          <p className="eyebrow eyebrow-on-navy mb-4">Melbourne · Sydney · Brisbane</p>
          <h1 className="font-serif text-3xl leading-[1.08] font-normal text-on-navy lg:text-5xl">
            Long-stay apartments for the people you look after.
          </h1>
          <div className="gold-rule my-6 hidden lg:block" />
          <p className="hidden text-base leading-relaxed text-on-navy-muted lg:block">
            Live availability, partner rates and a decision from our team within the agreed SLA. Built for insurance,
            corporate and government placements.
          </p>
        </div>
        <p className="eyebrow eyebrow-on-navy relative hidden lg:block">Invite-only · Confidential</p>
      </aside>
      <main className="bg-background relative flex items-center justify-center px-4 py-10 lg:px-12">
        {/* These screens have no app chrome, so the theme control sits on the canvas itself. */}
        <div className="absolute top-4 right-4 lg:top-6 lg:right-6">
          <ThemeToggle />
        </div>
        {/* "Password changed", "code not accepted" and friends are one-shot: shown, then dropped from the URL. */}
        <ScrubParams keys={AUTH_FLASH_KEYS} />
        <div className="border-subtle bg-surface rounded-card w-full max-w-[420px] border p-6 shadow-md sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
