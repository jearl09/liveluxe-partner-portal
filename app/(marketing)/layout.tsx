import type { ReactNode } from "react";
import { Wordmark } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";

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
      <aside className="bg-navy-900 relative flex flex-col justify-between overflow-hidden border-white/[0.06] px-8 py-8 text-white lg:border-r lg:px-14 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(transparent 31px, rgba(255,255,255,.6) 32px), linear-gradient(90deg, transparent 31px, rgba(255,255,255,.6) 32px)",
            backgroundSize: "32px 32px",
          }}
        />
        <Wordmark descriptor="Partner portal" tone="dark" className="relative" />
        <div className="relative my-12 max-w-md lg:my-0">
          <p className="eyebrow mb-4">Docklands, Melbourne</p>
          <h1 className="font-serif text-4xl leading-[1.08] font-normal text-white lg:text-5xl">
            Long-stay apartments for the people you look after.
          </h1>
          <div className="gold-rule my-6" />
          <p className="text-base leading-relaxed text-white/80">
            Live availability, partner rates and a decision from our team within the agreed SLA. Built for insurance,
            corporate and government placements.
          </p>
        </div>
        <p className="eyebrow relative hidden lg:block">Invite-only · Confidential</p>
      </aside>
      <section className="bg-background relative flex items-center justify-center px-4 py-10 lg:px-12">
        {/* These screens have no app chrome, so the theme control sits on the canvas itself. */}
        <div className="absolute top-4 right-4 lg:top-6 lg:right-6">
          <ThemeToggle />
        </div>
        <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 shadow-md">{children}</div>
      </section>
    </div>
  );
}
